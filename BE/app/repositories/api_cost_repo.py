"""SQL for the SF-14 / BR-79 API cost ledger and monthly budget (SRS_v2.2.txt:1767)."""

import uuid
from datetime import date, datetime

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_budget_period import ApiBudgetPeriod
from app.models.api_cost_entry import ApiCostEntry


async def create_entry(db: AsyncSession, **fields) -> ApiCostEntry:
    entry = ApiCostEntry(**fields)
    db.add(entry)
    await db.flush()
    return entry


async def total_cost(db: AsyncSession, *, start: date, end: date) -> int:
    """Sum of cost_vnd for GMT+7 business days start..end inclusive (failed calls included)."""
    result = await db.execute(
        select(func.coalesce(func.sum(ApiCostEntry.cost_vnd), 0)).where(
            ApiCostEntry.occurred_on >= start, ApiCostEntry.occurred_on <= end
        )
    )
    return int(result.scalar_one())


async def daily_totals(
    db: AsyncSession, *, start: date, end: date, success_status: str
) -> list[tuple[date, int, int, int]]:
    """(day, calls, successful calls, cost) for each day that has at least one call."""
    result = await db.execute(
        select(
            ApiCostEntry.occurred_on,
            func.count(ApiCostEntry.id),
            func.sum(case((ApiCostEntry.status == success_status, 1), else_=0)),
            func.coalesce(func.sum(ApiCostEntry.cost_vnd), 0),
        )
        .where(ApiCostEntry.occurred_on >= start, ApiCostEntry.occurred_on <= end)
        .group_by(ApiCostEntry.occurred_on)
        .order_by(ApiCostEntry.occurred_on)
    )
    return [(day, int(calls), int(ok), int(cost)) for day, calls, ok, cost in result.all()]


async def count_user_operation(db: AsyncSession, user_id: uuid.UUID, operation: str) -> int:
    """All-time count (not per month) of one user's calls of one operation."""
    result = await db.execute(
        select(func.count(ApiCostEntry.id)).where(
            ApiCostEntry.user_id == user_id, ApiCostEntry.operation == operation
        )
    )
    return int(result.scalar_one())


async def get_period(
    db: AsyncSession, period_month: date, *, for_update: bool = False
) -> ApiBudgetPeriod | None:
    query = select(ApiBudgetPeriod).where(ApiBudgetPeriod.period_month == period_month)
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def upsert_period(
    db: AsyncSession, *, period_month: date, budget_vnd: int, now: datetime
) -> ApiBudgetPeriod:
    """Insert the month's budget or update it in place (one row per month, enforced by
    uq_api_budget_periods_month), then return the row locked for the caller's transaction."""
    statement = (
        insert(ApiBudgetPeriod)
        .values(
            id=uuid.uuid4(),
            period_month=period_month,
            budget_vnd=budget_vnd,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_api_budget_periods_month",
            set_={"budget_vnd": budget_vnd, "updated_at": now},
        )
    )
    await db.execute(statement)
    period = await get_period(db, period_month, for_update=True)
    await db.refresh(period)
    return period
