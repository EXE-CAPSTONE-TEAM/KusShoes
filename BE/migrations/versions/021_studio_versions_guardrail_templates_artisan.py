"""studio: design versions, content guardrail, templates, artisan links

Revision ID: 021
Revises: 020
Create Date: 2026-09-21
"""
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None

_TRADEMARKS = [
    "nike", "adidas", "puma", "gucci", "louis vuitton", "converse", "vans",
    "new balance", "balenciaga", "jordan", "reebok", "chanel", "supreme", "disney",
]
_BANNED = ["fuck", "shit", "dit me", "dmm", "vcl", "cac", "cho de"]


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "max_versions_per_project", sa.Integer(), nullable=False, server_default="20"
        ),
    )
    op.execute("UPDATE plans SET max_versions_per_project = 50 WHERE tier = 'pro'")

    op.create_table(
        "design_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("design_config", postgresql.JSONB(), nullable=False),
        sa.Column("thumbnail_path", sa.String(1000), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "export_bake_job_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bake_jobs.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "version_no", name="uq_design_versions_project_no"),
    )
    op.create_index("ix_design_versions_project_id", "design_versions", ["project_id"])

    guardrail = op.create_table(
        "guardrail_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("term", sa.String(100), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('banned', 'trademark')", name="ck_guardrail_rules_kind"),
    )
    now = datetime.now(UTC)
    op.bulk_insert(
        guardrail,
        [
            {"id": uuid.uuid4(), "kind": kind, "term": term, "is_active": True,
             "created_at": now, "updated_at": now}
            for kind, terms in (("trademark", _TRADEMARKS), ("banned", _BANNED))
            for term in terms
        ],
    )

    op.create_table(
        "design_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("design_config", postgresql.JSONB(), nullable=False),
        sa.Column("thumbnail_path", sa.String(1000), nullable=True),
        sa.Column("layer_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_design_templates_status"
        ),
    )

    op.create_table(
        "artisan_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "export_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("export_records.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_downloads", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("download_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_artisan_links_project_id", "artisan_links", ["project_id"])


def downgrade() -> None:
    op.drop_table("artisan_links")
    op.drop_table("design_templates")
    op.drop_table("guardrail_rules")
    op.drop_table("design_versions")
    op.drop_column("plans", "max_versions_per_project")
