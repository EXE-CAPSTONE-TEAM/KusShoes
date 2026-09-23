import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class ContentReport(Base, TimestampMixin):
    """UC-24 copyright/trademark complaint against a project or a template
    (SRS_v2.2.txt:193). Upholding one advances the BR-77 ladder (SRS_v2.2.txt:2042)."""

    __tablename__ = "content_reports"
    __table_args__ = (
        CheckConstraint(
            "reason IN ('copyright', 'trademark', 'inappropriate', 'other')",
            name="ck_content_reports_reason",
        ),
        CheckConstraint(
            "status IN ('new', 'reviewing', 'upheld', 'dismissed')",
            name="ck_content_reports_status",
        ),
        CheckConstraint(
            "(project_id IS NOT NULL) <> (template_id IS NOT NULL)",
            name="ck_content_reports_single_target",
        ),
        Index(
            "ix_content_reports_status_created", "status", "created_at",
            postgresql_ops={"created_at": "DESC"},
        ),
        Index("ix_content_reports_reported_user", "reported_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("design_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Resolved server-side from the target's owner; the reporter never supplies it.
    reported_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reporter_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reporter_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new", server_default="new"
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
