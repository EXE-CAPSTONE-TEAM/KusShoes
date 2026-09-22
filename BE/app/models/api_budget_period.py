import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class ApiBudgetPeriod(Base, TimestampMixin):
    """SF-14: the Admin-configurable monthly API budget (SRS_v2.2.txt:1767). One row per
    month; `period_month` is the first day of the month in GMT+7. No row = unconfigured."""

    __tablename__ = "api_budget_periods"
    __table_args__ = (
        UniqueConstraint("period_month", name="uq_api_budget_periods_month"),
        CheckConstraint("budget_vnd >= 0", name="ck_api_budget_periods_budget"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    budget_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    # Set once per period when the warn threshold is first crossed (fires the admin alert once).
    warned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
