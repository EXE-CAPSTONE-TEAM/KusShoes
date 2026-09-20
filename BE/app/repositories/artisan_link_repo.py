import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artisan_link import ArtisanLink


async def create(db: AsyncSession, **fields) -> ArtisanLink:
    link = ArtisanLink(**fields)
    db.add(link)
    await db.flush()
    return link


async def get_by_hash(db: AsyncSession, token_hash: str) -> ArtisanLink | None:
    result = await db.execute(select(ArtisanLink).where(ArtisanLink.token_hash == token_hash))
    return result.scalar_one_or_none()


async def get_for_user(
    db: AsyncSession, link_id: uuid.UUID, user_id: uuid.UUID
) -> ArtisanLink | None:
    result = await db.execute(
        select(ArtisanLink).where(ArtisanLink.id == link_id, ArtisanLink.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_for_project(db: AsyncSession, project_id: uuid.UUID) -> list[ArtisanLink]:
    result = await db.execute(
        select(ArtisanLink)
        .where(ArtisanLink.project_id == project_id)
        .order_by(ArtisanLink.created_at.desc())
    )
    return list(result.scalars())


async def consume_download(db: AsyncSession, link: ArtisanLink, now: datetime) -> bool:
    """Atomic +1 guarded by quota/expiry so concurrent hits cannot overshoot."""
    result = await db.execute(
        update(ArtisanLink)
        .where(
            ArtisanLink.id == link.id,
            ArtisanLink.revoked_at.is_(None),
            ArtisanLink.expires_at > now,
            ArtisanLink.download_count < ArtisanLink.max_downloads,
        )
        .values(download_count=ArtisanLink.download_count + 1)
    )
    await db.flush()
    return result.rowcount == 1
