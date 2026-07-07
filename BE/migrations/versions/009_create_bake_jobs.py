"""009 create bake_jobs

Revision ID: 009
Revises: 008
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bake_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("design_config_snapshot", postgresql.JSONB, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="low"),
        sa.Column("result_glb_path", sa.Text, nullable=True),
        sa.Column("result_obj_path", sa.Text, nullable=True),
        sa.Column("result_zip_path", sa.Text, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("worker_id", sa.String(100), nullable=True),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed')",
            name="ck_bake_jobs_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low', 'normal', 'high')",
            name="ck_bake_jobs_priority",
        ),
    )

    op.create_index("idx_bake_jobs_project_id", "bake_jobs", ["project_id"])
    op.create_index(
        "idx_bake_jobs_status_priority", "bake_jobs", ["priority", "queued_at"],
        postgresql_where=sa.text("status = 'queued'"),
    )


def downgrade() -> None:
    op.drop_table("bake_jobs")
