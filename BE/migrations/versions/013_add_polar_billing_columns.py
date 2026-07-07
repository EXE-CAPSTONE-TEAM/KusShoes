"""add polar billing columns

Revision ID: 013
Revises: 012
Create Date: 2026-07-05
"""
import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("polar_product_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "idx_plans_polar_product_id",
        "plans",
        ["polar_product_id"],
        unique=True,
        postgresql_where=sa.text("polar_product_id IS NOT NULL"),
    )

    op.add_column(
        "subscriptions",
        sa.Column("polar_subscription_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "idx_subscriptions_polar_subscription_id",
        "subscriptions",
        ["polar_subscription_id"],
        unique=True,
        postgresql_where=sa.text("polar_subscription_id IS NOT NULL"),
    )
    op.add_column(
        "subscriptions",
        sa.Column("polar_customer_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column(
            "cancel_at_period_end", sa.Boolean(), nullable=False, server_default="FALSE"
        ),
    )

    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IN ('vnpay', 'momo', 'bank_transfer', 'polar')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IN ('vnpay', 'momo', 'bank_transfer')",
    )

    op.drop_column("subscriptions", "cancel_at_period_end")
    op.drop_column("subscriptions", "polar_customer_id")
    op.drop_index("idx_subscriptions_polar_subscription_id", table_name="subscriptions")
    op.drop_column("subscriptions", "polar_subscription_id")

    op.drop_index("idx_plans_polar_product_id", table_name="plans")
    op.drop_column("plans", "polar_product_id")
