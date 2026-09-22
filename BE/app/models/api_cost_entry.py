import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import utcnow


class ApiCostEntry(Base):
    """SF-14 / BR-79: cost of one 3D/AI API call, failed calls included, per user and
    per day (SRS_v2.2.txt:1767). `occurred_on` is the GMT+7 business day."""

    __tablename__ = "api_cost_entries"
    __table_args__ = (
        CheckConstraint("status IN ('success', 'failed')", name="ck_api_cost_entries_status"),
        CheckConstraint("cost_vnd >= 0", name="ck_api_cost_entries_cost"),
        Index("ix_api_cost_entries_day", "occurred_on"),
        Index("ix_api_cost_entries_user_day", "user_id", "occurred_on"),
        Index("ix_api_cost_entries_user_operation", "user_id", "operation"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    cost_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
