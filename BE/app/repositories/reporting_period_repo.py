import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reporting_period import ReportingPeriod


async def get_by_id(db: AsyncSession, period_id: uuid.UUID) -> ReportingPeriod | None:
    return await db.get(ReportingPeriod, period_id)


async def list_all(db: AsyncSession) -> list[ReportingPeriod]:
    result = await db.execute(select(ReportingPeriod).order_by(ReportingPeriod.start_date.desc()))
    return list(result.scalars())


async def find_overlapping(
    db: AsyncSession, start_date: date, end_date: date
) -> ReportingPeriod | None:
    result = await db.execute(
        select(ReportingPeriod).where(
            ReportingPeriod.start_date <= end_date, ReportingPeriod.end_date >= start_date
        )
    )
    return result.scalars().first()


async def find_locked_containing(db: AsyncSession, day: date) -> ReportingPeriod | None:
    result = await db.execute(
        select(ReportingPeriod).where(
            ReportingPeriod.status == "locked",
            ReportingPeriod.start_date <= day,
            ReportingPeriod.end_date >= day,
        )
    )
    return result.scalars().first()


async def create(
    db: AsyncSession, *, name: str, start_date: date, end_date: date
) -> ReportingPeriod:
    period = ReportingPeriod(name=name, start_date=start_date, end_date=end_date)
    db.add(period)
    await db.flush()
    return period


async def lock(db: AsyncSession, period: ReportingPeriod, admin_id: uuid.UUID) -> None:
    period.status = "locked"
    period.locked_by = admin_id
    period.locked_at = datetime.now(UTC)
    await db.flush()
