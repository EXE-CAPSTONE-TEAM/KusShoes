"""SQL for the Reports hub domain `chi-phi-he-thong` (SF-14 api_cost_entries, BR-94 scan_credits).

Windows: api_cost_entries are bucketed by `occurred_on` (GMT+7 business day, inclusive dates);
scan_credits carry timestamps, so the half-open UTC window [start_utc, end_utc) is used and the
service buckets them by GMT+7 day. Every query takes `limit` (= max_rows + 1) so overflow is
detectable; the service/generate() raises instead of truncating."""

from datetime import date, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_cost_entry import ApiCostEntry
from app.models.scan_credit import ScanCredit
from app.models.subscription import Subscription
from app.models.user import User


async def cost_by_operation(
    db: AsyncSession, *, start: date, end: date, success_status: str, limit: int
) -> list[tuple]:
    """(provider, operation, calls, ok_calls, cost_vnd) per provider+operation; all callers
    (internal accounts and system calls) are included because this is real spend."""
    cost = func.coalesce(func.sum(ApiCostEntry.cost_vnd), 0)
    result = await db.execute(
        select(
            ApiCostEntry.provider,
            ApiCostEntry.operation,
            func.count(ApiCostEntry.id),
            func.sum(case((ApiCostEntry.status == success_status, 1), else_=0)),
            cost,
        )
        .where(ApiCostEntry.occurred_on >= start, ApiCostEntry.occurred_on <= end)
        .group_by(ApiCostEntry.provider, ApiCostEntry.operation)
        .order_by(cost.desc(), ApiCostEntry.provider, ApiCostEntry.operation)
        .limit(limit)
    )
    return [
        (provider, operation, int(calls), int(ok or 0), int(total))
        for provider, operation, calls, ok, total in result.all()
    ]


async def cost_by_user(
    db: AsyncSession, *, start: date, end: date, scan_operation: str, limit: int
) -> list[tuple]:
    """(account_code | None, is_internal, tier | None, calls, scan_calls, cost_vnd) per user,
    INCLUDING internal accounts (BR-79 cap monitoring). Calls without a user come back as one
    row with account_code None. Never exposes email (BR-88)."""
    cost = func.coalesce(func.sum(ApiCostEntry.cost_vnd), 0)
    result = await db.execute(
        select(
            User.account_code,
            func.coalesce(User.is_internal, False),
            Subscription.tier,
            func.count(ApiCostEntry.id),
            func.sum(case((ApiCostEntry.operation == scan_operation, 1), else_=0)),
            cost,
        )
        .select_from(ApiCostEntry)
        .outerjoin(User, User.id == ApiCostEntry.user_id)
        .outerjoin(Subscription, Subscription.user_id == User.id)
        .where(ApiCostEntry.occurred_on >= start, ApiCostEntry.occurred_on <= end)
        .group_by(User.account_code, User.is_internal, Subscription.tier)
        .order_by(cost.desc(), User.account_code)
        .limit(limit)
    )
    return [
        (code, bool(internal), tier, int(calls), int(scans or 0), int(total))
        for code, internal, tier, calls, scans, total in result.all()
    ]


async def scan_cost_by_day(
    db: AsyncSession, *, start: date, end: date, scan_operation: str, success_status: str
) -> list[tuple]:
    """(day, ok_calls, failed_calls, cost_vnd) for scan_operation calls, one row per day that has
    at least one call (at most the number of days in the range)."""
    result = await db.execute(
        select(
            ApiCostEntry.occurred_on,
            func.sum(case((ApiCostEntry.status == success_status, 1), else_=0)),
            func.sum(case((ApiCostEntry.status != success_status, 1), else_=0)),
            func.coalesce(func.sum(ApiCostEntry.cost_vnd), 0),
        )
        .where(
            ApiCostEntry.operation == scan_operation,
            ApiCostEntry.occurred_on >= start,
            ApiCostEntry.occurred_on <= end,
        )
        .group_by(ApiCostEntry.occurred_on)
        .order_by(ApiCostEntry.occurred_on)
    )
    return [(day, int(ok or 0), int(bad or 0), int(cost)) for day, ok, bad, cost in result.all()]


async def credit_events(
    db: AsyncSession, *, start_utc: datetime, end_utc: datetime, expired_status: str, limit: int
) -> list[tuple]:
    """(purchased_at, consumed_at, expires_at, status, price_vnd) for credits of non-internal
    accounts (BR-83) with a purchase, a consumption or an expiry inside the window."""

    def in_window(column):
        return (column >= start_utc) & (column < end_utc)

    purchased = in_window(ScanCredit.purchased_at)
    consumed = in_window(ScanCredit.consumed_at)
    expired = (ScanCredit.status == expired_status) & in_window(ScanCredit.expires_at)
    result = await db.execute(
        select(
            ScanCredit.purchased_at,
            ScanCredit.consumed_at,
            ScanCredit.expires_at,
            ScanCredit.status,
            ScanCredit.price_vnd,
        )
        .join(User, User.id == ScanCredit.user_id)
        .where(User.is_internal.is_(False), or_(purchased, consumed, expired))
        .order_by(ScanCredit.purchased_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]
