import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.invoice import Invoice
    from app.models.user import User


class Refund(Base, TimestampMixin):
    """A REFUND ledger entry offsetting an invoice (BR-97) — created by an admin,
    never by the gateway. The originating invoice stays immutable (BR-31);
    this row is the auditable reversal record."""

    __tablename__ = "refunds"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False
    )
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    invoice: Mapped["Invoice"] = relationship()
    admin: Mapped["User"] = relationship(foreign_keys=[created_by])
