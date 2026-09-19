"""subscription grace period, project lock, cycle-anchored quota

Revision ID: 018
Revises: 017
Create Date: 2026-09-18
"""
import sqlalchemy as sa
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- subscriptions: grace state + cycle anchor ---
    op.add_column(
        "subscriptions", sa.Column("grace_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "subscriptions",
        sa.Column(
            "current_period_start",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status",
        "subscriptions",
        "status IN ('active', 'grace', 'cancelled', 'expired')",
    )

    # --- projects: BR-27 read-only lock ---
    op.add_column(
        "projects",
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default="false"),
    )

    # --- monthly_usage: rename year_month (date) -> period_start (timestamptz) ---
    op.drop_constraint("uq_monthly_usage_user_month", "monthly_usage", type_="unique")
    op.add_column(
        "monthly_usage", sa.Column("period_start", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE monthly_usage SET period_start = year_month::timestamptz "
        "WHERE period_start IS NULL"
    )
    op.alter_column("monthly_usage", "period_start", nullable=False)
    op.drop_column("monthly_usage", "year_month")
    op.create_unique_constraint(
        "uq_monthly_usage_user_period", "monthly_usage", ["user_id", "period_start"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_monthly_usage_user_period", "monthly_usage", type_="unique")
    op.add_column("monthly_usage", sa.Column("year_month", sa.Date(), nullable=True))
    op.execute("UPDATE monthly_usage SET year_month = period_start::date WHERE year_month IS NULL")
    op.alter_column("monthly_usage", "year_month", nullable=False)
    op.drop_column("monthly_usage", "period_start")
    op.create_unique_constraint(
        "uq_monthly_usage_user_month", "monthly_usage", ["user_id", "year_month"]
    )

    op.drop_column("projects", "is_locked")

    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status",
        "subscriptions",
        "status IN ('active', 'cancelled', 'expired')",
    )
    op.drop_column("subscriptions", "current_period_start")
    op.drop_column("subscriptions", "grace_until")
