import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import utcnow

if TYPE_CHECKING:
    from app.models.user import User


class MonthlyUsage(Base):
    """Per-cycle export/AI-credit counters — keyed by the subscription's own
    `current_period_start` (BR-23), not the calendar month despite the class
    name (kept to avoid a wider rename)."""

    __tablename__ = "monthly_usage"
    __table_args__ = (
        UniqueConstraint("user_id", "period_start", name="uq_monthly_usage_user_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    projects_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exports_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_credits_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="monthly_usages")
