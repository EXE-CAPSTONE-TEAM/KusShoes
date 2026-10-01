"""user_attributions: first-touch customer acquisition and attribution

Revision ID: 032
Revises: 031
Create Date: 2026-10-01
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_attributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("utm_source", sa.String(100), nullable=True),
        sa.Column("utm_medium", sa.String(100), nullable=True),
        sa.Column("utm_campaign", sa.String(150), nullable=True),
        sa.Column("utm_term", sa.String(150), nullable=True),
        sa.Column("utm_content", sa.String(150), nullable=True),
        sa.Column("fbclid", sa.String(255), nullable=True),
        sa.Column("ttclid", sa.String(255), nullable=True),
        sa.Column("gclid", sa.String(255), nullable=True),
        sa.Column("initial_referrer", sa.Text(), nullable=True),
        sa.Column("landing_page", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_attributions_source", "user_attributions", ["utm_source"])
    op.create_index("ix_user_attributions_campaign", "user_attributions", ["utm_campaign"])


def downgrade() -> None:
    op.drop_table("user_attributions")
