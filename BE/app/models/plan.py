import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Boolean, CheckConstraint, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import utcnow

if TYPE_CHECKING:
    from app.models.invoice import Invoice
    from app.models.subscription import Subscription


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        UniqueConstraint("tier", "billing_cycle", name="uq_plans_tier_billing_cycle"),
        CheckConstraint(
            "bake_priority IN ('low', 'normal', 'high')",
            name="ck_plans_bake_priority",
        ),
        CheckConstraint(
            "billing_cycle IN ('monthly', 'yearly') OR billing_cycle IS NULL",
            name="ck_plans_billing_cycle",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_cycle: Mapped[str | None] = mapped_column(String(20), nullable=True)  # NULL = free plan
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    max_projects: Mapped[int | None] = mapped_column(Integer, nullable=True)  # NULL = unlimited
    max_exports_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowed_export_formats: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=lambda: ["glb"]
    )
    bake_priority: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # §3.2.8 quota columns — dashboard/pricing read these as the single source
    # of truth (BR-92). max_scans_per_cycle is enforced per cycle by
    # quota_service (BR-23: plan scans first, then Credits); NULL counts as 0.
    max_ai_credits_per_cycle: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_scans_per_cycle: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_layers_per_zone: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_layers_per_project: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    allow_draw_artwork: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # BR-46: unpinned design versions kept per project (oldest pruned first)
    max_versions_per_project: Mapped[int] = mapped_column(Integer, nullable=False, default=20)

    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="plan")
