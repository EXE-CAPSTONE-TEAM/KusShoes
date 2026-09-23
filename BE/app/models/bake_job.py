import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import utcnow
from app.types import JsonObject

if TYPE_CHECKING:
    from app.models.export_record import ExportRecord
    from app.models.project import Project


class BakeJob(Base):
    __tablename__ = "bake_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    # bake | prepare — both run on KusStudio Desktop (spec §A, ADR-001/005)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="bake")
    # NULL only for prepare jobs (CHECK ck_bake_jobs_design_snapshot)
    design_config_snapshot: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="awaiting_client")
    # awaiting_client | claimed | completed | failed | cancelled
    source_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_assets.id", ondelete="SET NULL"), nullable=True
    )
    claim_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # SHA-256 hex of the claim token; the token itself is never stored.
    claim_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claim_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Staging keys issued with the current claim: [{format, file_path, content_type}]
    issued_outputs: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    crop_box: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
    # Stored complete() response — replayed verbatim on an idempotent retry.
    result: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    # low | normal | high

    # result_*_path removed — output files tracked in export_records (file_path + format)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="bake_jobs")
    export_records: Mapped[list["ExportRecord"]] = relationship(back_populates="bake_job")
