import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin

# The one place the Credit discriminators live (BR-94, SRS_v2.2.txt:1617; plan table
# SRS_v2.2.txt:898 "Không theo chu kỳ"). A Credit purchase is an invoice with
# plan_tier == CREDIT_INVOICE_TIER and billing_cycle == CREDIT_BILLING_CYCLE.
CREDIT_INVOICE_TIER = "credit"
CREDIT_BILLING_CYCLE = "one_time"

CREDIT_STATUS_AVAILABLE = "available"
CREDIT_STATUS_USED = "used"
CREDIT_STATUS_EXPIRED = "expired"
CREDIT_STATUS_REVOKED = "revoked"


class ScanCredit(Base, TimestampMixin):
    """One purchased single-scan Credit (BR-94 / UC-27, SRS_v2.2.txt:1617).

    Status only moves forward: available -> used | expired | revoked. Credits never reset at
    cycle end (SRS_v2.2.txt:2856) and a used Credit is non-refundable (SRS_v2.2.txt:1617).
    `purchase_cycle_start` records the billing-cycle anchor the purchase counted against, for
    the per-cycle purchase cap. `consumed_ref` is unique when set so a consumption is
    idempotent per caller reference (BR-23, SRS_v2.2.txt:1561).
    """

    __tablename__ = "scan_credits"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available', 'used', 'expired', 'revoked')",
            name="ck_scan_credits_status",
        ),
        Index("ix_scan_credits_user_status", "user_id", "status"),
        Index("ix_scan_credits_user_cycle", "user_id", "purchase_cycle_start"),
        Index("ix_scan_credits_status_expires", "status", "expires_at"),
        Index(
            "uq_scan_credits_consumed_ref",
            "consumed_ref",
            unique=True,
            postgresql_where=text("consumed_ref IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purchase_cycle_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CREDIT_STATUS_AVAILABLE,
        server_default=CREDIT_STATUS_AVAILABLE,
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
