import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AuthPasswordInvalid,
    AuthReauthenticationRequired,
    ProfileInvalid,
    UsernameAlreadyTaken,
)
from app.infrastructure import google_oauth, storage, task_queue
from app.repositories import (
    monthly_usage_repo,
    project_repo,
    refresh_token_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.user import (
    AvatarUploadRequest,
    AvatarUploadResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    UpdateProfileRequest,
    UsageResponse,
    UserDetailResponse,
)
from app.utils.password import hash_password, verify_password


async def get_profile(db: AsyncSession, user) -> UserDetailResponse:
    total_designs = await project_repo.count_for_user(db, user.id)
    return _to_detail(user, total_designs)


async def update_profile(
    db: AsyncSession, user, body: UpdateProfileRequest
) -> UserDetailResponse:
    changes = body.model_dump(exclude_unset=True)
    username = changes.get("username")
    if username and username != user.username:
        existing = await user_repo.get_by_username_any(db, username)
        if existing and existing.id != user.id:
            raise UsernameAlreadyTaken()
    avatar_path = changes.get("avatar_path")
    if avatar_path is not None and not avatar_path.startswith(f"avatars/{user.id}/"):
        raise ProfileInvalid("avatar_path không thuộc tài khoản hiện tại")
    await user_repo.update_fields(db, user, changes)
    return await get_profile(db, user)


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
    usage = await monthly_usage_repo.get_or_create_current_month(db, user.id)
    plan = subscription.plan if subscription else None
    return UsageResponse(
        tier=subscription.tier if subscription else "free",
        max_projects=plan.max_projects if plan else None,
        max_exports_per_month=plan.max_exports_per_month if plan else None,
        projects_count=usage.projects_count,
        exports_count=usage.exports_count,
        ai_credits_used=usage.ai_credits_used,
        ai_credits_limit=None,
    )


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
