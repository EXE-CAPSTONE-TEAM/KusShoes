import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, utcnow

if TYPE_CHECKING:
    from app.models.plan import Plan
    from app.models.user import User


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'cancelled', 'expired')",
            name="ck_subscriptions_status",
        ),
        CheckConstraint(
            "tier IN ('free', 'creator_monthly', 'creator_yearly', 'pro_monthly', 'pro_yearly')",
            name="ck_subscriptions_tier",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # NOT NULL — every user has a plan (free users reference the free plan row)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id"), nullable=False
    )
    # billing_cycle removed — derivable from plan.billing_cycle
    tier: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # NULL = free plan (no expiry)
    last_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True
    )
    polar_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    polar_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    user: Mapped["User"] = relationship(back_populates="subscription")
    plan: Mapped["Plan"] = relationship(back_populates="subscriptions")

    @property
    def is_active(self) -> bool:
        return self.status == "active"

    @property
    def is_free(self) -> bool:
        return self.tier == "free"

    @property
    def billing_cycle(self) -> str | None:
        """Derived from plan — not stored redundantly."""
        return self.plan.billing_cycle if self.plan else None
