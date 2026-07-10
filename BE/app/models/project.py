import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.types import JsonObject

if TYPE_CHECKING:
    from app.models.bake_job import BakeJob
    from app.models.export_record import ExportRecord
    from app.models.project_asset import ProjectAsset
    from app.models.user import User


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    canonical_model_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_assets.id", use_alter=True, name="fk_projects_canonical_model"),
        nullable=True,
    )
    design_config: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(Text, nullable=True)  # path in storage, NOT a URL

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="projects")
    assets: Mapped[list["ProjectAsset"]] = relationship(
        back_populates="project",
        foreign_keys="ProjectAsset.project_id",
        cascade="all, delete-orphan",
    )
    bake_jobs: Mapped[list["BakeJob"]] = relationship(back_populates="project")
    export_records: Mapped[list["ExportRecord"]] = relationship(back_populates="project")

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
