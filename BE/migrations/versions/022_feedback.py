"""feedback (UC-25 / BR-109)

Revision ID: 022
Revises: 021
Create Date: 2026-09-22
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedbacks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("marketing_group", sa.String(20), nullable=False, server_default="product"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("changed_what", sa.Text(), nullable=True),
        sa.Column(
            "reviewed_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_feedbacks_rating"),
        sa.CheckConstraint(
            "status IN ('new', 'reviewed', 'planned', 'done', 'wont_do')",
            name="ck_feedbacks_status",
        ),
        sa.CheckConstraint(
            "marketing_group IN ('product', 'price', 'place', 'promotion')",
            name="ck_feedbacks_group",
        ),
    )
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])


def downgrade() -> None:
    op.drop_table("feedbacks")
