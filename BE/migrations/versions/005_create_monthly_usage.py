"""005 create monthly_usage

Revision ID: 005
Revises: 004
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year_month", sa.Date, nullable=False),
        sa.Column("projects_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("exports_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("ai_credits_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "year_month", name="uq_monthly_usage_user_month"),
    )


def downgrade() -> None:
    op.drop_table("monthly_usage")
