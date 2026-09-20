import io
import json
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AuthPasswordInvalid,
    AuthRateLimited,
    AuthReauthenticationRequired,
    ConsentNotFound,
    ProfileInvalid,
    UsernameAlreadyTaken,
    UsernameChangeCooldown,
    UsernameReserved,
)
from app.infrastructure import google_oauth, rate_limiter, storage, task_queue
from app.repositories import (
    consent_repo,
    login_history_repo,
    project_repo,
    refresh_token_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.user import (
    AvatarUploadRequest,
    AvatarUploadResponse,
    ChangePasswordRequest,
    ConsentResponse,
    DataExportResponse,
    DeleteAccountRequest,
    LoginHistoryItem,
    LoginHistoryResponse,
    PrivacySettingsResponse,
    RecordConsentRequest,
    UpdatePrivacySettingsRequest,
    UpdateProfileRequest,
    UsageResponse,
    UserDetailResponse,
)
from app.services import quota_service
from app.utils.password import hash_password, verify_password

USERNAME_CHANGE_COOLDOWN_DAYS = 30
RESERVED_USERNAMES = {
    "admin", "administrator", "kusshoes", "support", "root", "api", "staff",
    "moderator", "mod", "help", "info", "contact", "security", "billing",
    "official", "system", "null", "undefined", "vietstride", "webmaster",
}


async def get_profile(db: AsyncSession, user) -> UserDetailResponse:
    total_designs = await project_repo.count_for_user(db, user.id)
    return _to_detail(user, total_designs)


async def update_profile(
    db: AsyncSession, user, body: UpdateProfileRequest
) -> UserDetailResponse:
    changes = body.model_dump(exclude_unset=True)
    username = changes.pop("username", None)
    avatar_path = changes.get("avatar_path")
    if avatar_path is not None and not avatar_path.startswith(f"avatars/{user.id}/"):
        raise ProfileInvalid("avatar_path không thuộc tài khoản hiện tại")
    await user_repo.update_fields(db, user, changes)

    if username and username != user.username:
        await _change_username(db, user, username)

    return await get_profile(db, user)


async def _change_username(db: AsyncSession, user, username: str) -> None:
    """BR-10: reserved words blocked, case-insensitive uniqueness, 1 change/30 days."""
    if username.lower() in RESERVED_USERNAMES:
        raise UsernameReserved()
    existing = await user_repo.get_by_username_case_insensitive(db, username)
    if existing and existing.id != user.id:
        raise UsernameAlreadyTaken()
    if user.username_changed_at:
        elapsed = datetime.now(UTC) - user.username_changed_at
        if elapsed < timedelta(days=USERNAME_CHANGE_COOLDOWN_DAYS):
            days_left = USERNAME_CHANGE_COOLDOWN_DAYS - elapsed.days
            raise UsernameChangeCooldown(max(days_left, 1))
    await user_repo.set_username(db, user, username)


def create_avatar_upload(user, body: AvatarUploadRequest) -> AvatarUploadResponse:
    extension_by_type = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    file_path = f"avatars/{user.id}/{uuid.uuid4()}{extension_by_type[body.content_type]}"
    return AvatarUploadResponse(
        upload_url=storage.generate_presigned_upload_url(file_path, body.content_type),
        file_path=file_path,
    )


async def delete_avatar(db: AsyncSession, user) -> dict[str, str]:
    previous_path = await user_repo.clear_avatar(db, user)
    if previous_path:
        await db.commit()
        task_queue.enqueue_storage_delete(previous_path)
    return {"message": "Đã xóa ảnh đại diện"}


async def change_password(
    db: AsyncSession, user, body: ChangePasswordRequest
) -> dict[str, str]:
    if not user.password_hash:
        raise AuthReauthenticationRequired()
    if not verify_password(body.current_password, user.password_hash):
        raise AuthPasswordInvalid()
    await user_repo.set_password_hash(db, user, hash_password(body.new_password))
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    return {"message": "Đổi mật khẩu thành công"}


async def delete_account(
    db: AsyncSession, user, body: DeleteAccountRequest
) -> dict[str, str]:
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise AuthReauthenticationRequired()
    elif not body.google_id_token or not await _verify_google_id_token(user, body.google_id_token):
        raise AuthReauthenticationRequired()
    await user_repo.soft_delete(db, user)
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    await db.commit()
    task_queue.enqueue_user_cleanup(str(user.id), countdown=30 * 24 * 3600)
    return {"message": "Tài khoản đã được xóa"}


async def get_usage(db: AsyncSession, user) -> UsageResponse:
    subscription = await subscription_repo.get_by_user(db, user.id)
    usage = await quota_service.get_usage(db, user.id, subscription)
    plan = subscription.plan if subscription else None
    return UsageResponse(
        tier=subscription.tier if subscription else "free",
        max_projects=plan.max_projects if plan else None,
        max_exports_per_month=plan.max_exports_per_month if plan else None,
        # projects_count is the LIVE total (BR-46's "dự án lưu tối đa" is an
        # inventory cap, not a per-cycle rate) — not the cycle usage row.
        projects_count=await project_repo.count_for_user(db, user.id),
        exports_count=usage.exports_count,
        ai_credits_used=usage.ai_credits_used,
        ai_credits_limit=plan.max_ai_credits_per_cycle if plan else None,
    )


# --- BR-15 Privacy settings ---


def get_privacy_settings(user) -> PrivacySettingsResponse:
    return PrivacySettingsResponse(
        is_profile_public=user.is_profile_public,
        show_designs_publicly=user.show_designs_publicly,
        is_searchable=user.is_searchable,
        allow_analytics=user.allow_analytics,
        allow_ads_personalization=user.allow_ads_personalization,
    )


async def update_privacy_settings(
    db: AsyncSession, user, body: UpdatePrivacySettingsRequest
) -> PrivacySettingsResponse:
    changes = body.model_dump(exclude_unset=True)
    await user_repo.update_fields(db, user, changes)
    await db.commit()
    return get_privacy_settings(user)


# --- BR-89 Consent ---


async def list_consents(db: AsyncSession, user) -> list[ConsentResponse]:
    records = await consent_repo.list_for_user(db, user.id)
    return [_to_consent_response(r) for r in records]


async def record_consent(
    db: AsyncSession, user, body: RecordConsentRequest
) -> ConsentResponse:
    """BR-87/88: opt-in consents the user can grant or revoke at any time,
    separate from the mandatory ToS/privacy-policy consent taken at signup."""
    if not body.granted:
        active = await consent_repo.get_active(db, user.id, body.type)
        if not active:
            raise ConsentNotFound()
        await consent_repo.revoke(db, active)
        await db.commit()
        return _to_consent_response(active)

    record = await consent_repo.create(
        db, user_id=user.id, type=body.type, doc_version=body.doc_version
    )
    await db.commit()
    return _to_consent_response(record)


def _to_consent_response(record) -> ConsentResponse:
    return ConsentResponse(
        id=record.id,
        type=record.type,
        doc_version=record.doc_version,
        channel=record.channel,
        created_at=record.created_at,
        revoked_at=record.revoked_at,
    )


# --- BR-18 Login history ---


async def get_login_history(db: AsyncSession, user) -> LoginHistoryResponse:
    rows = await login_history_repo.list_for_user(db, user.id)
    return LoginHistoryResponse(
        items=[
            LoginHistoryItem(
                id=row.id,
                success=row.success,
                ip_address=_mask_ip(row.ip_address),
                user_agent=row.user_agent,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )


def _mask_ip(ip_address: str | None) -> str | None:
    """BR-18: the user sees their own IP with the last octet masked."""
    if not ip_address:
        return ip_address
    parts = ip_address.split(".")
    if len(parts) == 4:
        return ".".join([*parts[:3], "xxx"])
    if ":" in ip_address:  # IPv6 — mask the last group
        groups = ip_address.split(":")
        return ":".join([*groups[:-1], "xxxx"])
    return ip_address


# --- SF-11 Data export ---


async def export_account_data(
    db: AsyncSession, redis: aioredis.Redis, user
) -> DataExportResponse:
    """BR-19: 1 export/24h. Bundles profile + project metadata + consents +
    login history as JSON — binary assets (GLB/textures/images) are not
    included, since those already live in per-project export downloads."""
    retry_after = await rate_limiter.consume(
        redis, bucket="data-export", identifier=str(user.id), limit=1, window_seconds=86400
    )
    if retry_after is not None:
        raise AuthRateLimited(retry_after)

    projects = await project_repo.list_for_user(db, user.id, 1000, None)
    consents = await consent_repo.list_for_user(db, user.id)
    history = await login_history_repo.list_for_user(db, user.id)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("profile.json", json.dumps(_export_profile(user), indent=2, default=str))
        archive.writestr(
            "projects.json",
            json.dumps([_export_project(p) for p in projects], indent=2, default=str),
        )
        archive.writestr(
            "consents.json",
            json.dumps([_to_consent_response(c).model_dump() for c in consents], indent=2, default=str),
        )
        archive.writestr(
            "login_history.json",
            json.dumps(
                [
                    {
                        "success": h.success,
                        "ip_address": _mask_ip(h.ip_address),
                        "user_agent": h.user_agent,
                        "created_at": h.created_at.isoformat(),
                    }
                    for h in history
                ],
                indent=2,
            ),
        )

    file_path = f"data-exports/{user.id}/{uuid.uuid4()}.zip"
    storage.upload_bytes(file_path, buffer.getvalue(), "application/zip")
    ttl = 900
    return DataExportResponse(
        download_url=storage.generate_presigned_download_url(file_path, ttl=ttl),
        expires_in=ttl,
    )


def _export_profile(user) -> dict:
    return {
        "account_code": user.account_code,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "phone_number": user.phone_number,
        "bio": user.bio,
        "language": user.language,
        "preferred_styles": user.preferred_styles,
        "member_since": user.created_at,
    }


def _export_project(project) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "design_config": project.design_config,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


async def _verify_google_id_token(user, token: str) -> bool:
    return await google_oauth.verify_id_token(
        token,
        google_id=user.google_id,
        email=user.email,
    )


def _to_detail(user, total_designs: int) -> UserDetailResponse:
    return UserDetailResponse(
        id=user.id,
        account_code=user.account_code,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        avatar_path=user.avatar_path,
        phone_number=user.phone_number,
        bio=user.bio,
        language=user.language,
        preferred_styles=user.preferred_styles,
        status=user.status,
        member_since=user.created_at,
        total_designs=total_designs,
    )
