import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User

CONSENT_TYPES = (
    "tos",
    "privacy_policy",
    "age_confirmation",
    "marketing_content",
    "academic_report",
    "cookie_analytics",
)


class ConsentRecord(Base, TimestampMixin):
    """BR-89: one row per consent event (ToS, privacy, BR-87 marketing-content
    use, BR-88 academic-report use, cookies, age self-certification)."""

    __tablename__ = "consent_records"
    __table_args__ = (
        CheckConstraint(
            "type IN ('tos', 'privacy_policy', 'age_confirmation', "
            "'marketing_content', 'academic_report', 'cookie_analytics')",
            name="ck_consent_records_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    doc_version: Mapped[str] = mapped_column(String(20), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="web")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()
