"""007 create projects

Revision ID: 007
Revises: 006
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("canonical_model_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        # FK to project_assets added in migration 008
        sa.Column("design_config", postgresql.JSONB, nullable=True),
        sa.Column("thumbnail_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'in_progress', 'baking', 'completed')",
            name="ck_projects_status",
        ),
    )

    op.create_index(
        "idx_projects_user_id", "projects", ["user_id", "updated_at"],
        postgresql_ops={"updated_at": "DESC"},
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_projects_status", "projects", ["status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("projects")
