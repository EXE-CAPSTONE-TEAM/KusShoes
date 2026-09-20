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
        query = query.with_for_update()
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
