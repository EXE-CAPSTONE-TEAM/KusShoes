import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import utcnow


class ModerationAction(Base):
    """One rung of the BR-77 ladder applied to a user (SRS_v2.2.txt:2042):
    1 warning -> 2 public-sharing restriction -> 3 account ban. Append-only."""

    __tablename__ = "moderation_actions"
    __table_args__ = (
        CheckConstraint("level IN (1, 2, 3)", name="ck_moderation_actions_level"),
        CheckConstraint(
            "action IN ('warning', 'share_restriction', 'ban')",
            name="ck_moderation_actions_action",
        ),
        Index(
            "ix_moderation_actions_user_created", "user_id", "created_at",
            postgresql_ops={"created_at": "DESC"},
        ),
        Index("ix_moderation_actions_restriction", "user_id", "restricted_until"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_reports.id", ondelete="SET NULL"),
        nullable=True,
    )
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Only set for level 2 (share_restriction).
    restricted_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
