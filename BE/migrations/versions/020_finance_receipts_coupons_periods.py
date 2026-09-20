"""finance: receipts, coupons, manual transactions, reporting periods, COMP

Revision ID: 020
Revises: 019
Create Date: 2026-09-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1")

    # --- invoices ---
    op.add_column("invoices", sa.Column("receipt_number", sa.String(30), nullable=True))
    op.add_column("invoices", sa.Column("receipt_path", sa.Text(), nullable=True))
    op.add_column(
        "invoices", sa.Column("receipt_snapshot", postgresql.JSONB(), nullable=True)
    )
    op.add_column(
        "invoices",
        sa.Column("is_upgrade", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("invoices", sa.Column("coupon_code", sa.String(40), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("is_manual", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("invoices", sa.Column("proof_path", sa.Text(), nullable=True))
    op.add_column("invoices", sa.Column("collected_by", sa.String(100), nullable=True))
    op.add_column("invoices", sa.Column("manual_reason", sa.Text(), nullable=True))
    op.add_column(
        "invoices",
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
    )
    op.add_column(
        "invoices",
        sa.Column(
            "approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
    )
    op.create_unique_constraint("uq_invoices_receipt_number", "invoices", ["receipt_number"])
    op.drop_constraint("ck_invoices_status", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_status",
        "invoices",
        "status IN ('pending', 'awaiting_approval', 'paid', 'failed', 'cancelled', 'refunded')",
    )

    # --- subscriptions: BR-103 COMP label ---
    op.add_column(
        "subscriptions",
        sa.Column("is_comp", sa.Boolean(), nullable=False, server_default="false"),
    )

    # --- coupons ---
    op.create_table(
        "coupons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("discount_type", sa.String(20), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("plan_tiers", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("first_payment_only", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "discount_type IN ('percent', 'fixed', 'fixed_price')",
            name="ck_coupons_discount_type",
        ),
    )
    op.create_table(
        "coupon_redemptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "coupon_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("coupons.id"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "invoice_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("coupon_id", "user_id", name="uq_coupon_redemptions_coupon_user"),
    )

    # --- reporting periods (BR-98) ---
    op.create_table(
        "reporting_periods",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column(
            "locked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('open', 'locked')", name="ck_reporting_periods_status"),
        sa.CheckConstraint("end_date >= start_date", name="ck_reporting_periods_range"),
    )


def downgrade() -> None:
    op.drop_table("reporting_periods")
    op.drop_table("coupon_redemptions")
    op.drop_table("coupons")
    op.drop_column("subscriptions", "is_comp")

    op.drop_constraint("ck_invoices_status", "invoices", type_="check")
    op.execute("UPDATE invoices SET status = 'failed' WHERE status IN ('awaiting_approval', 'cancelled')")
    op.create_check_constraint(
        "ck_invoices_status", "invoices", "status IN ('pending', 'paid', 'failed', 'refunded')"
    )
    op.drop_constraint("uq_invoices_receipt_number", "invoices", type_="unique")
    for column in (
        "approved_by", "created_by", "manual_reason", "collected_by", "proof_path",
        "is_manual", "coupon_code", "is_upgrade", "receipt_snapshot", "receipt_path",
        "receipt_number",
    ):
        op.drop_column("invoices", column)
    op.execute("DROP SEQUENCE IF EXISTS receipt_number_seq")
