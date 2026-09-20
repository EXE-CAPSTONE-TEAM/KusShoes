import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import utcnow
from app.types import JsonObject


class DesignVersion(Base):
    """Snapshot of a project's design_config (BR-46). Versions taken at export
    time are pinned so pruning never removes what a factory was sent."""

    __tablename__ = "design_versions"
    __table_args__ = (
        UniqueConstraint("project_id", "version_no", name="uq_design_versions_project_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    design_config: Mapped[JsonObject] = mapped_column(JSONB, nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    export_bake_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bake_jobs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
