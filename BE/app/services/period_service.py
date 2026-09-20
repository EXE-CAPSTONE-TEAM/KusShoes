"""BR-98: reporting-period locking. All business dates are GMT+7 (CR-01)."""
import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import PeriodLocked, ReportingPeriodInvalid
from app.repositories import reporting_period_repo
from app.services.audit import record_audit

GMT7 = timezone(timedelta(hours=7))


def to_business_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(GMT7).date()
    return value


async def assert_open(db: AsyncSession, when: date | datetime) -> None:
    """Raises PeriodLocked if a ledger entry dated `when` would land in a locked period."""
    if await reporting_period_repo.find_locked_containing(db, to_business_date(when)):
        raise PeriodLocked()


async def list_periods(db: AsyncSession):
    return await reporting_period_repo.list_all(db)


async def create_period(db: AsyncSession, admin, *, name: str, start_date: date, end_date: date):
    if end_date < start_date:
        raise ReportingPeriodInvalid("Ngày kết thúc phải sau ngày bắt đầu")
    if await reporting_period_repo.find_overlapping(db, start_date, end_date):
        raise ReportingPeriodInvalid("Kỳ báo cáo bị trùng với kỳ đã có")
    period = await reporting_period_repo.create(
        db, name=name, start_date=start_date, end_date=end_date
    )
    await record_audit(
        db, admin, "period.create", target_type="reporting_period", target_id=period.id,
        payload={"start": str(start_date), "end": str(end_date)},
    )
    await db.commit()
    return period


async def lock_period(db: AsyncSession, admin, period_id: uuid.UUID):
    period = await reporting_period_repo.get_by_id(db, period_id)
    if not period:
        raise ReportingPeriodInvalid("Không tìm thấy kỳ báo cáo")
    if period.status == "locked":
        raise ReportingPeriodInvalid("Kỳ này đã khoá sổ")
    await reporting_period_repo.lock(db, period, admin.id)
    await record_audit(
        db, admin, "period.lock", target_type="reporting_period", target_id=period.id,
        payload={"start": str(period.start_date), "end": str(period.end_date)},
    )
    await db.commit()
    return period
