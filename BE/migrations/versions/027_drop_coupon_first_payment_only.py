"""drop coupons.first_payment_only (Early Bird removed)

Revision ID: 027
Revises: 026
Create Date: 2026-09-21
"""
import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("coupons", "first_payment_only")


def downgrade() -> None:
    op.add_column(
        "coupons",
        sa.Column("first_payment_only", sa.Boolean(), nullable=False, server_default="false"),
    )
