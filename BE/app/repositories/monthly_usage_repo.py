import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monthly_usage import MonthlyUsage


async def create_for_user(
    db: AsyncSession, *, user_id: uuid.UUID, period_start: datetime
) -> MonthlyUsage:
    usage = MonthlyUsage(user_id=user_id, period_start=period_start)
    db.add(usage)
    await db.flush()
    return usage


async def get_or_create_period(
    db: AsyncSession,
    user_id: uuid.UUID,
    period_start: datetime,
    *,
    for_update: bool = False,
) -> MonthlyUsage:
    await db.execute(
        insert(MonthlyUsage)
        .values(user_id=user_id, period_start=period_start)
        .on_conflict_do_nothing(index_elements=["user_id", "period_start"])
    )
    query = select(MonthlyUsage).where(
        MonthlyUsage.user_id == user_id,
        MonthlyUsage.period_start == period_start,
    )
    if for_update:
        # Re-read the locked row: counters are bumped with SQL UPDATEs, so an instance
        # already in the identity map would otherwise report stale values.
        query = query.with_for_update().execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one()


async def increment_projects(
    db: AsyncSession, user_id: uuid.UUID, period_start: datetime, delta: int
) -> None:
    usage = await get_or_create_period(db, user_id, period_start)
    expression = MonthlyUsage.projects_count + delta
    if delta < 0:
        from sqlalchemy import func

        expression = func.greatest(0, expression)
    await db.execute(
        update(MonthlyUsage)
        .where(MonthlyUsage.id == usage.id)
        .values(projects_count=expression)
    )


async def increment_exports(
    db: AsyncSession, user_id: uuid.UUID, period_start: datetime, count: int
) -> None:
    usage = await get_or_create_period(db, user_id, period_start)
    await db.execute(
        update(MonthlyUsage)
        .where(MonthlyUsage.id == usage.id)
        .values(exports_count=MonthlyUsage.exports_count + count)
    )


async def get_period(
    db: AsyncSession, user_id: uuid.UUID, period_start: datetime
) -> MonthlyUsage | None:
    """Read-only lookup: never creates the row (used by non-mutating quota checks)."""
    result = await db.execute(
        select(MonthlyUsage)
        .where(
            MonthlyUsage.user_id == user_id,
            MonthlyUsage.period_start == period_start,
        )
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def increment_scans(
    db: AsyncSession, user_id: uuid.UUID, period_start: datetime, count: int
) -> None:
    """BR-23 (SRS_v2.2.txt:1561): plan scans spent in this cycle."""
    usage = await get_or_create_period(db, user_id, period_start)
    await db.execute(
        update(MonthlyUsage)
        .where(MonthlyUsage.id == usage.id)
        .values(scans_used=MonthlyUsage.scans_used + count)
    )
