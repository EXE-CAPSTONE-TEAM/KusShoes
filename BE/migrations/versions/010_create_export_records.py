"""010 create export_records

Revision ID: 010
Revises: 009
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "export_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("bake_job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("bake_jobs.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("format", sa.String(10), nullable=False),
        sa.Column("file_path", sa.Text, nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("download_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("format IN ('glb', 'obj', 'zip')", name="ck_export_records_format"),
    )

    op.create_index(
        "idx_export_records_user_id", "export_records", ["user_id", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )
    op.create_index("idx_export_records_project_id", "export_records", ["project_id"])


def downgrade() -> None:
    op.drop_table("export_records")
