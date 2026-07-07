"""003 create plans + seed

Revision ID: 003
Revises: 002
Create Date: 2026-06-20
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tier", sa.String(20), nullable=False),
        sa.Column("billing_cycle", sa.String(20), nullable=True),
        sa.Column("price_vnd", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_projects", sa.Integer, nullable=True),
        sa.Column("max_exports_per_month", sa.Integer, nullable=True),
        sa.Column(
            "allowed_export_formats",
            postgresql.ARRAY(sa.String),
            nullable=False,
            server_default="{glb}",
        ),
        sa.Column("bake_priority", sa.String(20), nullable=False, server_default="low"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tier", "billing_cycle", name="uq_plans_tier_cycle"),
    )

    # Seed data
    plans_table = sa.table(
        "plans",
        sa.column("id", postgresql.UUID),
        sa.column("tier", sa.String),
        sa.column("billing_cycle", sa.String),
        sa.column("price_vnd", sa.Integer),
        sa.column("max_projects", sa.Integer),
        sa.column("max_exports_per_month", sa.Integer),
        sa.column("allowed_export_formats", postgresql.ARRAY(sa.String)),
        sa.column("bake_priority", sa.String),
    )

    op.bulk_insert(plans_table, [
        {"id": str(uuid.uuid4()), "tier": "free",    "billing_cycle": None,      "price_vnd": 0,       "max_projects": 3,    "max_exports_per_month": 5,    "allowed_export_formats": ["glb"],           "bake_priority": "low"},
        {"id": str(uuid.uuid4()), "tier": "creator", "billing_cycle": "monthly", "price_vnd": 199000,  "max_projects": 20,   "max_exports_per_month": 50,   "allowed_export_formats": ["glb", "obj"],    "bake_priority": "normal"},
        {"id": str(uuid.uuid4()), "tier": "creator", "billing_cycle": "yearly",  "price_vnd": 1990000, "max_projects": 20,   "max_exports_per_month": 50,   "allowed_export_formats": ["glb", "obj"],    "bake_priority": "normal"},
        {"id": str(uuid.uuid4()), "tier": "pro",     "billing_cycle": "monthly", "price_vnd": 499000,  "max_projects": None, "max_exports_per_month": None, "allowed_export_formats": ["glb", "obj", "zip"], "bake_priority": "high"},
        {"id": str(uuid.uuid4()), "tier": "pro",     "billing_cycle": "yearly",  "price_vnd": 4990000, "max_projects": None, "max_exports_per_month": None, "allowed_export_formats": ["glb", "obj", "zip"], "bake_priority": "high"},
    ])


def downgrade() -> None:
    op.drop_table("plans")
