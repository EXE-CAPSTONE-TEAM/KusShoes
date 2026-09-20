import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
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
            "status IN ('pending', 'awaiting_approval', 'paid', 'failed', 'cancelled', 'refunded')",
            name="ck_invoices_status",
        ),
        CheckConstraint(
            "payment_method IN ('payos', 'momo', 'manual')",
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
    # order_code is the gateway-facing order identifier (PayOS orderCode / MoMo
    # orderId) — a random unique int, not the sequential invoice UUID.
    order_code: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    # listed_price_vnd/discount_vnd satisfy BR-31's receipt requirement
    # (giá niêm yết, giảm giá, số thực trả) — amount_vnd is what was actually paid.
    listed_price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_vnd: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_transaction_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    gateway_payment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # the gateway's own reference for the settled payment (PayOS `reference` /
    # MoMo `transId`) — distinct from order_code, used on the printed receipt.
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # BR-31: immutable KUS-xxx receipt, issued when the payment is confirmed.
    receipt_number: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    receipt_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Frozen at issue time so a re-rendered receipt is byte-for-byte the same content (BR-09/31).
    receipt_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # BR-24: set when checkout priced this as a mid-cycle upgrade (keeps expiry/anchor on activation).
    is_upgrade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    coupon_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # BR-95: off-gateway payments recorded by an admin, approved by a different admin.
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    proof_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    collected_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manual_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="invoices", foreign_keys=[user_id])
    plan: Mapped["Plan | None"] = relationship(back_populates="invoices")
