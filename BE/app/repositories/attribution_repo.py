import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_attribution import UserAttribution


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_term: str | None = None,
    utm_content: str | None = None,
    fbclid: str | None = None,
    ttclid: str | None = None,
    gclid: str | None = None,
    initial_referrer: str | None = None,
    landing_page: str | None = None,
) -> UserAttribution:
    record = UserAttribution(
        user_id=user_id,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        utm_term=utm_term,
        utm_content=utm_content,
        fbclid=fbclid,
        ttclid=ttclid,
        gclid=gclid,
        initial_referrer=initial_referrer,
        landing_page=landing_page,
    )
    db.add(record)
    await db.flush()
    return record


async def get_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> UserAttribution | None:
    result = await db.execute(
        select(UserAttribution).where(UserAttribution.user_id == user_id)
    )
    return result.scalar_one_or_none()
