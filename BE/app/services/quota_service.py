"""BR-23: cycle-anchored quota bookkeeping.

Free tier quota resets on a rolling ~30-day window anchored to the account's
own registration date, computed on the fly. Paid tiers only move their anchor
forward when a payment activates/renews the subscription (billing_service) —
between payments, the anchor stays fixed so quota isn't reset without paying.
"""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monthly_usage import MonthlyUsage
from app.models.subscription import Subscription
from app.repositories import monthly_usage_repo

_PERIOD_LENGTH = timedelta(days=30)


def current_period_start(
    subscription: Subscription | None, *, now: datetime | None = None
) -> datetime:
    now = now or datetime.now(UTC)
    if subscription is None:
        return now
    anchor = subscription.current_period_start
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=UTC)
    if subscription.tier != "free":
        return anchor
    elapsed = now - anchor
    if elapsed < _PERIOD_LENGTH:
        return anchor
    periods_passed = elapsed // _PERIOD_LENGTH
    return anchor + periods_passed * _PERIOD_LENGTH


async def get_usage(
    db: AsyncSession,
    user_id: uuid.UUID,
    subscription: Subscription | None,
    *,
    for_update: bool = False,
) -> MonthlyUsage:
    return await monthly_usage_repo.get_or_create_period(
        db, user_id, current_period_start(subscription), for_update=for_update
    )


async def increment_projects(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None, delta: int
) -> None:
    await monthly_usage_repo.increment_projects(
        db, user_id, current_period_start(subscription), delta
    )


async def increment_exports(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None, count: int
) -> None:
    await monthly_usage_repo.increment_exports(
        db, user_id, current_period_start(subscription), count
    )
