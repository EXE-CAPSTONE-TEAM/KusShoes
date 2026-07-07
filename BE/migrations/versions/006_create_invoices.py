"""006 create invoices + add FK to subscriptions

Revision ID: 006
Revises: 005
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id"), nullable=True),
        sa.Column("plan_tier", sa.String(20), nullable=False),
        sa.Column("billing_cycle", sa.String(20), nullable=False),
        sa.Column("amount_vnd", sa.Integer, nullable=False),
        sa.Column("payment_method", sa.String(20), nullable=False),
        sa.Column("gateway_transaction_id", sa.String(255), unique=True, nullable=True),
        sa.Column("gateway_payment_url", sa.Text, nullable=True),
        sa.Column("gateway_metadata", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'paid', 'failed', 'refunded')", name="ck_invoices_status"),
        sa.CheckConstraint("payment_method IN ('payos', 'vnpay', 'momo')", name="ck_invoices_payment_method"),
    )

    op.create_index("idx_invoices_user_id", "invoices", ["user_id"])
    op.create_index(
        "idx_invoices_gateway_txn", "invoices", ["gateway_transaction_id"],
        unique=True, postgresql_where=sa.text("gateway_transaction_id IS NOT NULL"),
    )

    # Add FK from subscriptions.last_invoice_id → invoices.id
    op.create_foreign_key(
        "fk_subscriptions_last_invoice",
        "subscriptions", "invoices",
        ["last_invoice_id"], ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_subscriptions_last_invoice", "subscriptions", type_="foreignkey")
    op.drop_table("invoices")
