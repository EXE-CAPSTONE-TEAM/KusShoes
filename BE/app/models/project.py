import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


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
    design_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    current_design_revision: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    thumbnail_path: Mapped[str | None] = mapped_column(Text, nullable=True)  # path in storage, NOT a URL

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="projects")  # noqa: F821
    assets: Mapped[list["ProjectAsset"]] = relationship(  # noqa: F821
        back_populates="project",
        foreign_keys="ProjectAsset.project_id",
        cascade="all, delete-orphan",
    )
    bake_jobs: Mapped[list["BakeJob"]] = relationship(  # noqa: F821
        back_populates="project"
    )
    export_records: Mapped[list["ExportRecord"]] = relationship(  # noqa: F821
        back_populates="project"
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
