"""create audit logs and widen bake job status

Revision ID: 014
Revises: 013
Create Date: 2026-07-05
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("actor_role", sa.String(20), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "idx_audit_logs_created_at",
        "audit_logs",
        [sa.text("created_at DESC")],
    )
    op.create_index("idx_audit_logs_actor", "audit_logs", ["actor_id", "created_at"])
    op.create_index("idx_audit_logs_action", "audit_logs", ["action"])
    op.create_index("idx_audit_logs_target", "audit_logs", ["target_type", "target_id"])

    op.drop_constraint("ck_bake_jobs_status", "bake_jobs", type_="check")
    op.create_check_constraint(
        "ck_bake_jobs_status",
        "bake_jobs",
        "status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_bake_jobs_status", "bake_jobs", type_="check")
    op.create_check_constraint(
        "ck_bake_jobs_status",
        "bake_jobs",
        "status IN ('queued', 'processing', 'completed', 'failed')",
    )

    op.drop_index("idx_audit_logs_target", table_name="audit_logs")
    op.drop_index("idx_audit_logs_action", table_name="audit_logs")
    op.drop_index("idx_audit_logs_actor", table_name="audit_logs")
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
