import uuid
from datetime import datetime

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


async def signup_attribution_rows(
    db: AsyncSession,
    start_dt: datetime | None = None,
    end_dt: datetime | None = None,
) -> list[tuple]:
    """(user_id, utm_source, utm_medium, utm_campaign, initial_referrer, created_at).
    Excludes internal accounts (BR-83).
    """
    from app.models.user import User

    stmt = (
        select(
            User.id,
            UserAttribution.utm_source,
            UserAttribution.utm_medium,
            UserAttribution.utm_campaign,
            UserAttribution.initial_referrer,
            User.created_at,
        )
        .outerjoin(UserAttribution, UserAttribution.user_id == User.id)
        .where(User.is_internal.is_(False))
    )

    if start_dt:
        stmt = stmt.where(User.created_at >= start_dt)
    if end_dt:
        stmt = stmt.where(User.created_at <= end_dt)

    result = await db.execute(stmt)
    return [tuple(r) for r in result.all()]


async def paid_invoice_attribution_rows(
    db: AsyncSession,
    start_dt: datetime | None = None,
    end_dt: datetime | None = None,
) -> list[tuple]:
    """(invoice_id, user_id, amount_vnd, utm_source, utm_campaign, paid_at).
    Excludes internal accounts (BR-83).
    """
    from app.models.invoice import Invoice
    from app.models.user import User

    stmt = (
        select(
            Invoice.id,
            Invoice.user_id,
            Invoice.amount_vnd,
            UserAttribution.utm_source,
            UserAttribution.utm_campaign,
            Invoice.paid_at,
        )
        .join(User, User.id == Invoice.user_id)
        .outerjoin(UserAttribution, UserAttribution.user_id == User.id)
        .where(
            Invoice.status == "paid",
            Invoice.paid_at.is_not(None),
            Invoice.amount_vnd > 0,
            User.is_internal.is_(False),
        )
    )

    if start_dt:
        stmt = stmt.where(Invoice.paid_at >= start_dt)
    if end_dt:
        stmt = stmt.where(Invoice.paid_at <= end_dt)

    result = await db.execute(stmt)
    return [tuple(r) for r in result.all()]

