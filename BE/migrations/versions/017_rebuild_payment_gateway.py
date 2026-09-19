"""rebuild payment gateway: drop Polar, add PayOS/MoMo + refunds ledger

Revision ID: 017
Revises: 016
Create Date: 2026-09-18
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


# tier renamed 'creator' -> 'basic' + quotas corrected to SRS §3.2.8. Yearly
# plans are kept in the table (BR-93: hidden, not deleted) but deactivated —
# only Tháng (monthly) is sold this term.
PLAN_SPECS = [
    {
        "tier": "free", "billing_cycle": None, "price_vnd": 0,
        "max_projects": 3, "max_exports_per_month": 0,
        "allowed_export_formats": ["glb"], "bake_priority": "low", "is_active": True,
        "max_ai_credits_per_cycle": 5, "max_scans_per_cycle": 0,
        "max_layers_per_zone": 5, "max_layers_per_project": 30, "allow_draw_artwork": False,
    },
    {
        "tier": "basic", "billing_cycle": "monthly", "price_vnd": 259_000,
        "max_projects": 20, "max_exports_per_month": 100,
        "allowed_export_formats": ["glb"], "bake_priority": "normal", "is_active": True,
        "max_ai_credits_per_cycle": 100, "max_scans_per_cycle": 1,
        "max_layers_per_zone": 5, "max_layers_per_project": 30, "allow_draw_artwork": True,
    },
    {
        "tier": "basic", "billing_cycle": "yearly", "price_vnd": 3_108_000,
        "max_projects": 20, "max_exports_per_month": 100,
        "allowed_export_formats": ["glb"], "bake_priority": "normal", "is_active": False,
        "max_ai_credits_per_cycle": 100, "max_scans_per_cycle": 1,
        "max_layers_per_zone": 5, "max_layers_per_project": 30, "allow_draw_artwork": True,
    },
    {
        "tier": "pro", "billing_cycle": "monthly", "price_vnd": 649_000,
        "max_projects": 50, "max_exports_per_month": 300,
        "allowed_export_formats": ["glb", "obj"], "bake_priority": "high", "is_active": True,
        "max_ai_credits_per_cycle": 300, "max_scans_per_cycle": 3,
        "max_layers_per_zone": 5, "max_layers_per_project": 60, "allow_draw_artwork": True,
    },
    {
        "tier": "pro", "billing_cycle": "yearly", "price_vnd": 7_788_000,
        "max_projects": 50, "max_exports_per_month": 300,
        "allowed_export_formats": ["glb", "obj"], "bake_priority": "high", "is_active": False,
        "max_ai_credits_per_cycle": 300, "max_scans_per_cycle": 3,
        "max_layers_per_zone": 5, "max_layers_per_project": 60, "allow_draw_artwork": True,
    },
]


def _plans_table() -> sa.TableClause:
    return sa.table(
        "plans",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("tier", sa.String),
        sa.column("billing_cycle", sa.String),
        sa.column("price_vnd", sa.Integer),
        sa.column("max_projects", sa.Integer),
        sa.column("max_exports_per_month", sa.Integer),
        sa.column("allowed_export_formats", postgresql.ARRAY(sa.String)),
        sa.column("bake_priority", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("max_ai_credits_per_cycle", sa.Integer),
        sa.column("max_scans_per_cycle", sa.Integer),
        sa.column("max_layers_per_zone", sa.Integer),
        sa.column("max_layers_per_project", sa.Integer),
        sa.column("allow_draw_artwork", sa.Boolean),
    )


def upgrade() -> None:
    bind = op.get_bind()

    # --- plans: drop Polar column, add §3.2.8 quota columns ---
    op.drop_index("idx_plans_polar_product_id", table_name="plans")
    op.drop_column("plans", "polar_product_id")
    op.add_column("plans", sa.Column("max_ai_credits_per_cycle", sa.Integer(), nullable=True))
    op.add_column("plans", sa.Column("max_scans_per_cycle", sa.Integer(), nullable=True))
    op.add_column(
        "plans",
        sa.Column("max_layers_per_zone", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "plans",
        sa.Column("max_layers_per_project", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column(
        "plans",
        sa.Column("allow_draw_artwork", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.execute("UPDATE plans SET tier = 'basic' WHERE tier = 'creator'")

    plans = _plans_table()
    for spec in PLAN_SPECS:
        cycle_clause = (
            plans.c.billing_cycle.is_(None)
            if spec["billing_cycle"] is None
            else plans.c.billing_cycle == spec["billing_cycle"]
        )
        plan_id = bind.execute(
            sa.select(plans.c.id).where(plans.c.tier == spec["tier"], cycle_clause)
        ).scalar_one_or_none()
        if plan_id is None:
            bind.execute(plans.insert().values(id=uuid.uuid4(), **spec))
        else:
            bind.execute(plans.update().where(plans.c.id == plan_id).values(**spec))

    # --- subscriptions: rename tier, drop Polar columns ---
    op.drop_constraint("ck_subscriptions_tier", "subscriptions", type_="check")
    op.execute(
        "UPDATE subscriptions SET tier = 'basic_monthly' WHERE tier = 'creator_monthly'"
    )
    op.execute(
        "UPDATE subscriptions SET tier = 'basic_yearly' WHERE tier = 'creator_yearly'"
    )
    op.create_check_constraint(
        "ck_subscriptions_tier",
        "subscriptions",
        "tier IN ('free', 'basic_monthly', 'basic_yearly', 'pro_monthly', 'pro_yearly')",
    )
    op.drop_index("idx_subscriptions_polar_subscription_id", table_name="subscriptions")
    op.drop_column("subscriptions", "polar_subscription_id")
    op.drop_column("subscriptions", "polar_customer_id")

    # --- invoices: gateway swap + receipt fields + order_code ---
    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.execute("UPDATE invoices SET payment_method = 'manual' WHERE payment_method = 'polar'")

    op.add_column("invoices", sa.Column("order_code", sa.BigInteger(), nullable=True))
    op.add_column("invoices", sa.Column("listed_price_vnd", sa.Integer(), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("discount_vnd", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("invoices", sa.Column("payment_reference", sa.String(255), nullable=True))

    op.execute(
        """
        UPDATE invoices SET order_code = sub.rn + 100000
        FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM invoices) sub
        WHERE invoices.id = sub.id
        """
    )
    op.execute("UPDATE invoices SET listed_price_vnd = amount_vnd WHERE listed_price_vnd IS NULL")

    op.alter_column("invoices", "order_code", nullable=False)
    op.alter_column("invoices", "listed_price_vnd", nullable=False)
    op.create_unique_constraint("uq_invoices_order_code", "invoices", ["order_code"])
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IN ('payos', 'momo', 'manual')",
    )

    # --- refunds ledger (BR-97) ---
    op.create_table(
        "refunds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invoice_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id"), nullable=False,
        ),
        sa.Column("amount_vnd", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"), nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_refunds_invoice_id", "refunds", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("idx_refunds_invoice_id", table_name="refunds")
    op.drop_table("refunds")

    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IN ('vnpay', 'momo', 'bank_transfer', 'polar')",
    )
    op.drop_constraint("uq_invoices_order_code", "invoices", type_="unique")
    op.drop_column("invoices", "payment_reference")
    op.drop_column("invoices", "discount_vnd")
    op.drop_column("invoices", "listed_price_vnd")
    op.drop_column("invoices", "order_code")

    op.add_column(
        "subscriptions", sa.Column("polar_customer_id", sa.String(255), nullable=True)
    )
    op.add_column(
        "subscriptions", sa.Column("polar_subscription_id", sa.String(255), nullable=True)
    )
    op.create_index(
        "idx_subscriptions_polar_subscription_id",
        "subscriptions",
        ["polar_subscription_id"],
        unique=True,
        postgresql_where=sa.text("polar_subscription_id IS NOT NULL"),
    )
    op.drop_constraint("ck_subscriptions_tier", "subscriptions", type_="check")
    op.execute("UPDATE subscriptions SET tier = 'creator_monthly' WHERE tier = 'basic_monthly'")
    op.execute("UPDATE subscriptions SET tier = 'creator_yearly' WHERE tier = 'basic_yearly'")
    op.create_check_constraint(
        "ck_subscriptions_tier",
        "subscriptions",
        "tier IN ('free', 'creator_monthly', 'creator_yearly', 'pro_monthly', 'pro_yearly')",
    )

    op.execute("UPDATE plans SET tier = 'creator' WHERE tier = 'basic'")
    op.drop_column("plans", "allow_draw_artwork")
    op.drop_column("plans", "max_layers_per_project")
    op.drop_column("plans", "max_layers_per_zone")
    op.drop_column("plans", "max_scans_per_cycle")
    op.drop_column("plans", "max_ai_credits_per_cycle")
    op.add_column("plans", sa.Column("polar_product_id", sa.String(255), nullable=True))
    op.create_index(
        "idx_plans_polar_product_id",
        "plans",
        ["polar_product_id"],
        unique=True,
        postgresql_where=sa.text("polar_product_id IS NOT NULL"),
    )
