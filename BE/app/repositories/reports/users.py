"""Report queries for the `nguoi-dung` domain. Windows are half-open [start_utc, end_utc) and
every query excludes internal accounts (BR-83)."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.user import User
from app.models.user_attribution import UserAttribution


async def signup_utm_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(user_id, utm_source, utm_medium, utm_campaign) for customers who registered in the window.
    Users without an attribution record come back with three None UTM fields."""
    result = await db.execute(
        select(
            User.id,
            UserAttribution.utm_source,
            UserAttribution.utm_medium,
            UserAttribution.utm_campaign,
        )
        .outerjoin(UserAttribution, UserAttribution.user_id == User.id)
        .where(
            User.role == "user",
            User.is_internal.is_(False),
            User.deleted_at.is_(None),
            User.created_at >= start_utc,
            User.created_at < end_utc,
        )
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def utm_paid_invoice_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(invoice_id, user_id, paid_at, amount_vnd, billing_cycle, plan_tier, is_upgrade,
    utm_source, utm_medium, utm_campaign) -- the first seven match `analytics_repo.paid_invoice_rows`
    so they feed `analytics_service.build_payments`; amounts are gross (refunds netted by caller)."""
    result = await db.execute(
        select(
            Invoice.id,
            Invoice.user_id,
            Invoice.paid_at,
            Invoice.amount_vnd,
            Invoice.billing_cycle,
            Invoice.plan_tier,
            Invoice.is_upgrade,
            UserAttribution.utm_source,
            UserAttribution.utm_medium,
            UserAttribution.utm_campaign,
        )
        .join(User, User.id == Invoice.user_id)
        .outerjoin(UserAttribution, UserAttribution.user_id == User.id)
        .where(
            Invoice.paid_at.is_not(None),
            Invoice.status.in_(["paid", "refunded"]),
            Invoice.amount_vnd > 0,
            User.is_internal.is_(False),
            Invoice.paid_at >= start_utc,
            Invoice.paid_at < end_utc,
        )
        .order_by(Invoice.paid_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def account_codes(db: AsyncSession, user_ids: list) -> dict:
    """{user_id: account_code} -- the BR-88 pseudonym reports show instead of email."""
    if not user_ids:
        return {}
    result = await db.execute(select(User.id, User.account_code).where(User.id.in_(user_ids)))
    return {user_id: code for user_id, code in result.all()}
