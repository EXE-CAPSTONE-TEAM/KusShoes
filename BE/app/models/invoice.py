import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.plan import Plan
    from app.models.user import User


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'paid', 'failed', 'refunded')",
            name="ck_invoices_status",
        ),
        CheckConstraint(
            "payment_method IN ('vnpay', 'momo', 'bank_transfer', 'polar')",
            name="ck_invoices_payment_method",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id"), nullable=True
    )
    # plan_tier + billing_cycle are intentional snapshots — invoice records what was paid for
    plan_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_transaction_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    gateway_payment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    gateway_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="invoices")
    plan: Mapped["Plan | None"] = relationship(back_populates="invoices")
