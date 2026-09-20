import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class Feedback(Base, TimestampMixin):
    """UC-25 / BR-109 customer feedback, triaged by admins."""

    __tablename__ = "feedbacks"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_feedbacks_rating"),
        CheckConstraint(
            "status IN ('new', 'reviewed', 'planned', 'done', 'wont_do')",
            name="ck_feedbacks_status",
        ),
        CheckConstraint(
            "marketing_group IN ('product', 'price', 'place', 'promotion')",
            name="ck_feedbacks_group",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    marketing_group: Mapped[str] = mapped_column(String(20), nullable=False, default="product")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Snapshot at submit time so later flag changes never rewrite history.
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    changed_what: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
