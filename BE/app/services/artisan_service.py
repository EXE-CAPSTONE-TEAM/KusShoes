"""BR-101 artisan share links: owner-managed, public no-auth download."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    ArtisanLinkInvalid,
    ArtisanLinkNotFound,
    ArtisanLinkPlanRequired,
    AuthRateLimited,
    ExportNotFound,
    ExportNotReady,
    PublicSharingRestricted,
)
from app.infrastructure import rate_limiter, storage
from app.repositories import (
    artisan_link_repo,
    export_record_repo,
    moderation_repo,
    project_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.studio import (
    ArtisanDownloadResponse,
    ArtisanLinkCreated,
    ArtisanLinkResponse,
    ArtisanPublicView,
)
from app.services.project_access import require_owner
from app.utils.jwt import hash_token

LINK_TTL_DAYS = 30
MAX_DOWNLOADS = 20
SIGNED_URL_TTL_SECONDS = 900  # 15 min
PUBLIC_RATE_LIMIT = 30
PUBLIC_RATE_WINDOW_SECONDS = 60


async def create_link(
    db: AsyncSession, user, project_id: uuid.UUID, export_id: uuid.UUID | None
) -> ArtisanLinkCreated:
    project = await require_owner(db, project_id, user)
    await _require_public_sharing_allowed(db, user.id)
    subscription = await subscription_repo.get_by_user(db, user.id)
    # BR-101: paid plan only, and not while payment is overdue (grace).
    if (
        not subscription
        or subscription.plan.tier == "free"
        or subscription.status != "active"
    ):
        raise ArtisanLinkPlanRequired()
    if export_id is not None:
        record = await export_record_repo.get_for_project(db, export_id, project.id)
        if not record:
            raise ExportNotFound()
    else:
        record = await export_record_repo.latest_for_project(db, project.id)
        if not record:
            raise ExportNotReady()
    token = secrets.token_urlsafe(32)
    link = await artisan_link_repo.create(
        db,
        project_id=project.id,
        user_id=user.id,
        export_record_id=record.id,
        token_hash=hash_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=LINK_TTL_DAYS),
        max_downloads=MAX_DOWNLOADS,
    )
    await db.commit()
    return ArtisanLinkCreated(
        **_to_response(link).model_dump(),
        token=token,
        url=f"{settings.ARTISAN_VIEWER_BASE_URL.rstrip('/')}/{token}",
    )


async def list_links(
    db: AsyncSession, user, project_id: uuid.UUID
) -> list[ArtisanLinkResponse]:
    await require_owner(db, project_id, user)
    links = await artisan_link_repo.list_for_project(db, project_id)
    return [_to_response(link) for link in links]


async def revoke_link(db: AsyncSession, user, link_id: uuid.UUID) -> dict[str, str]:
    link = await artisan_link_repo.get_for_user(db, link_id, user.id)
    if not link:
        raise ArtisanLinkNotFound()
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
    await db.commit()
    return {"message": "Đã thu hồi link"}


async def renew_link(db: AsyncSession, user, link_id: uuid.UUID) -> ArtisanLinkResponse:
    link = await artisan_link_repo.get_for_user(db, link_id, user.id)
    if not link or link.revoked_at is not None:
        raise ArtisanLinkNotFound()
    await _require_public_sharing_allowed(db, user.id)
    link.expires_at = datetime.now(UTC) + timedelta(days=LINK_TTL_DAYS)
    link.download_count = 0
    await db.commit()
    return _to_response(link)


# --- Public (no auth) -----------------------------------------------------------------


async def _enforce_public_rate_limit(redis: aioredis.Redis, client_ip: str) -> None:
    retry_after = await rate_limiter.consume(
        redis,
        bucket="artisan-public",
        identifier=client_ip,
        limit=PUBLIC_RATE_LIMIT,
        window_seconds=PUBLIC_RATE_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise AuthRateLimited(retry_after)


async def _resolve_active(db: AsyncSession, token: str):
    link = await artisan_link_repo.get_by_hash(db, hash_token(token))
    now = datetime.now(UTC)
    if (
        not link
        or link.revoked_at is not None
        or link.expires_at <= now
        or link.download_count >= link.max_downloads
    ):
        raise ArtisanLinkInvalid()  # MSG48 — same answer for every failure mode
    owner = await user_repo.get_by_id(db, link.user_id)
    if (
        # SRS_v2.2.txt:1171 "tài khoản bị khoá → MSG48" (BR-77 level 3 ban sets
        # status='suspended'); :1966 also voids the link when the account is deleted.
        owner is None
        or owner.status == "suspended"
        # BR-77 level 2 (SRS_v2.2.txt:2042): no public sharing while restricted. Same uniform
        # MSG48 answer (:1970) so the public side learns nothing about the owner's state.
        or await moderation_repo.active_restriction(db, owner.id, now=now) is not None
    ):
        raise ArtisanLinkInvalid()
    return link


async def _require_public_sharing_allowed(db: AsyncSession, user_id: uuid.UUID) -> None:
    """BR-77 level 2 (SRS_v2.2.txt:2042): an artisan link is public sharing, so none may be
    created or renewed while the owner's 30-day restriction is active."""
    restricted_until = await moderation_repo.active_restriction(
        db, user_id, now=datetime.now(UTC)
    )
    if restricted_until is not None:
        raise PublicSharingRestricted(restricted_until.isoformat())


async def public_view(
    db: AsyncSession, redis: aioredis.Redis, token: str, client_ip: str
) -> ArtisanPublicView:
    await _enforce_public_rate_limit(redis, client_ip)
    link = await _resolve_active(db, token)
    project = await project_repo.get_by_id(db, link.project_id)
    record = await export_record_repo.get_by_id(db, link.export_record_id)
    if not project or not record:
        raise ArtisanLinkInvalid()
    return ArtisanPublicView(
        project_id=project.id,
        project_name=project.name,
        format=record.format,
        expires_at=link.expires_at,
        downloads_remaining=link.max_downloads - link.download_count,
    )


async def public_download(
    db: AsyncSession, redis: aioredis.Redis, token: str, client_ip: str
) -> ArtisanDownloadResponse:
    await _enforce_public_rate_limit(redis, client_ip)
    link = await _resolve_active(db, token)
    record = await export_record_repo.get_by_id(db, link.export_record_id)
    if not record:
        raise ArtisanLinkInvalid()
    if not await artisan_link_repo.consume_download(db, link, datetime.now(UTC)):
        raise ArtisanLinkInvalid()
    url = storage.generate_presigned_download_url(record.file_path, ttl=SIGNED_URL_TTL_SECONDS)
    await db.commit()
    return ArtisanDownloadResponse(download_url=url, expires_in_seconds=SIGNED_URL_TTL_SECONDS)


def _to_response(link) -> ArtisanLinkResponse:
    now = datetime.now(UTC)
    return ArtisanLinkResponse(
        id=link.id,
        project_id=link.project_id,
        export_record_id=link.export_record_id,
        expires_at=link.expires_at,
        max_downloads=link.max_downloads,
        download_count=link.download_count,
        revoked_at=link.revoked_at,
        is_active=(
            link.revoked_at is None
            and link.expires_at > now
            and link.download_count < link.max_downloads
        ),
    )
