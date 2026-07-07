import uuid
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monthly_usage import MonthlyUsage


def _first_of_month() -> date:
    today = date.today()
    return today.replace(day=1)


async def create_for_user(db: AsyncSession, *, user_id: uuid.UUID) -> MonthlyUsage:
    usage = MonthlyUsage(user_id=user_id, year_month=_first_of_month())
    db.add(usage)
    await db.flush()
    return usage


async def get_or_create_current_month(
    db: AsyncSession, user_id: uuid.UUID, *, for_update: bool = False
) -> MonthlyUsage:
    month = _first_of_month()
    await db.execute(
        insert(MonthlyUsage)
        .values(user_id=user_id, year_month=month)
        .on_conflict_do_nothing(index_elements=["user_id", "year_month"])
    )
    query = select(MonthlyUsage).where(
            MonthlyUsage.user_id == user_id,
            MonthlyUsage.year_month == month,
        )
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one()


async def increment_projects(db: AsyncSession, user_id: uuid.UUID, delta: int) -> None:
    usage = await get_or_create_current_month(db, user_id)
    expression = MonthlyUsage.projects_count + delta
    if delta < 0:
        from sqlalchemy import func

        expression = func.greatest(0, expression)
    await db.execute(
        update(MonthlyUsage)
        .where(MonthlyUsage.id == usage.id)
        .values(projects_count=expression)
    )


async def increment_exports(db: AsyncSession, user_id: uuid.UUID, count: int) -> None:
    usage = await get_or_create_current_month(db, user_id)
    await db.execute(
        update(MonthlyUsage)
        .where(MonthlyUsage.id == usage.id)
        .values(exports_count=MonthlyUsage.exports_count + count)
    )
