"""008 create project_assets + add FK to projects

Revision ID: 008
Revises: 007
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("asset_type", sa.String(30), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("file_path", sa.Text, nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ready"),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "asset_type IN ('source_model', 'sticker', 'texture', 'reference_image')",
            name="ck_project_assets_type",
        ),
        sa.CheckConstraint(
            "status IN ('uploading', 'processing', 'ready', 'failed')",
            name="ck_project_assets_status",
        ),
    )

    op.create_index("idx_project_assets_project_id", "project_assets", ["project_id"])
    op.create_index("idx_project_assets_type", "project_assets", ["project_id", "asset_type"])

    # Add FK from projects.canonical_model_asset_id → project_assets.id
    op.create_foreign_key(
        "fk_projects_canonical_model",
        "projects", "project_assets",
        ["canonical_model_asset_id"], ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_canonical_model", "projects", type_="foreignkey")
    op.drop_table("project_assets")
