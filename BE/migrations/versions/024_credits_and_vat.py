"""credits: BR-94 scan_credits ledger + BR-23 monthly_usage.scans_used (BR-28 needs no DDL)

- BR-94 / UC-27 (SRS_v2.2.txt:1617, :2856): `scan_credits` is the per-Credit ledger. One row
  per purchased Credit; status moves available -> used | expired | revoked and never back.
- BR-23 (SRS_v2.2.txt:1561): `monthly_usage.scans_used` counts plan scans spent in the current
  cycle; plan scans are consumed before Credits.
- `uq_scan_credits_consumed_ref` makes a credit consumption idempotent per caller reference.
- BR-28 (SRS_v2.2.txt:1643) VAT is a config toggle frozen into `invoices.receipt_snapshot`;
  it has no schema of its own.

`invoices.plan_tier` / `invoices.billing_cycle` carry no CHECK constraint (verified), so the
credit invoice values "credit" / "one_time" need no constraint change here.

Revision ID: 024
Revises: 023
Create Date: 2026-09-21
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if "scan_credits" not in inspector.get_table_names():
        op.create_table(
            "scan_credits",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column(
                "invoice_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("purchase_cycle_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("price_vnd", sa.Integer(), nullable=False),
            sa.Column(
                "status", sa.String(20), nullable=False, server_default="available"
            ),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("consumed_ref", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "status IN ('available', 'used', 'expired', 'revoked')",
                name="ck_scan_credits_status",
            ),
        )
        op.create_index(
            "ix_scan_credits_user_status", "scan_credits", ["user_id", "status"]
        )
        op.create_index(
            "ix_scan_credits_user_cycle", "scan_credits", ["user_id", "purchase_cycle_start"]
        )
        op.create_index(
            "ix_scan_credits_status_expires", "scan_credits", ["status", "expires_at"]
        )
        op.create_index(
            "uq_scan_credits_consumed_ref",
            "scan_credits",
            ["consumed_ref"],
            unique=True,
            postgresql_where=sa.text("consumed_ref IS NOT NULL"),
        )

    usage_columns = {column["name"] for column in inspector.get_columns("monthly_usage")}
    if "scans_used" not in usage_columns:
        op.add_column(
            "monthly_usage",
            sa.Column("scans_used", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    usage_columns = {column["name"] for column in inspector.get_columns("monthly_usage")}
    if "scans_used" in usage_columns:
        op.drop_column("monthly_usage", "scans_used")

    if "scan_credits" in inspector.get_table_names():
        op.drop_index("uq_scan_credits_consumed_ref", table_name="scan_credits")
        op.drop_index("ix_scan_credits_status_expires", table_name="scan_credits")
        op.drop_index("ix_scan_credits_user_cycle", table_name="scan_credits")
        op.drop_index("ix_scan_credits_user_status", table_name="scan_credits")
        op.drop_table("scan_credits")
