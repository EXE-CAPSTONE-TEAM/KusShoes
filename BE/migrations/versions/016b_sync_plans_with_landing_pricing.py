"""016 sync plans with Landing pricing

Revision ID: 016b
Revises: 016
Create Date: 2026-07-12
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "016b"
down_revision = "016"
branch_labels = None
depends_on = None


LANDING_PLAN_SPECS = [
    {
        "tier": "free",
        "billing_cycle": None,
        "price_vnd": 0,
        "max_projects": 3,
        "max_exports_per_month": 5,
        "allowed_export_formats": ["glb"],
        "bake_priority": "low",
        "is_active": True,
    },
    {
        "tier": "creator",
        "billing_cycle": "monthly",
        "price_vnd": 259_000,
        "max_projects": 10,
        "max_exports_per_month": 50,
        "allowed_export_formats": ["glb", "obj"],
        "bake_priority": "normal",
        "is_active": True,
    },
    {
        "tier": "creator",
        "billing_cycle": "yearly",
        "price_vnd": 3_108_000,
        "max_projects": 10,
        "max_exports_per_month": 50,
        "allowed_export_formats": ["glb", "obj"],
        "bake_priority": "normal",
        "is_active": True,
    },
    {
        "tier": "pro",
        "billing_cycle": "monthly",
        "price_vnd": 649_000,
        "max_projects": 50,
        "max_exports_per_month": None,
        "allowed_export_formats": ["glb", "obj", "zip"],
        "bake_priority": "high",
        "is_active": True,
    },
    {
        "tier": "pro",
        "billing_cycle": "yearly",
        "price_vnd": 7_788_000,
        "max_projects": 50,
        "max_exports_per_month": None,
        "allowed_export_formats": ["glb", "obj", "zip"],
        "bake_priority": "high",
        "is_active": True,
    },
]


PREVIOUS_PLAN_SPECS = [
    {
        "tier": "free",
        "billing_cycle": None,
        "price_vnd": 0,
        "max_projects": 3,
        "max_exports_per_month": 5,
        "allowed_export_formats": ["glb"],
        "bake_priority": "low",
        "is_active": True,
    },
    {
        "tier": "creator",
        "billing_cycle": "monthly",
        "price_vnd": 199_000,
        "max_projects": 20,
        "max_exports_per_month": 50,
        "allowed_export_formats": ["glb", "obj"],
        "bake_priority": "normal",
        "is_active": True,
    },
    {
        "tier": "creator",
        "billing_cycle": "yearly",
        "price_vnd": 1_990_000,
        "max_projects": 20,
        "max_exports_per_month": 50,
        "allowed_export_formats": ["glb", "obj"],
        "bake_priority": "normal",
        "is_active": True,
    },
    {
        "tier": "pro",
        "billing_cycle": "monthly",
        "price_vnd": 499_000,
        "max_projects": None,
        "max_exports_per_month": None,
        "allowed_export_formats": ["glb", "obj", "zip"],
        "bake_priority": "high",
        "is_active": True,
    },
    {
        "tier": "pro",
        "billing_cycle": "yearly",
        "price_vnd": 4_990_000,
        "max_projects": None,
        "max_exports_per_month": None,
        "allowed_export_formats": ["glb", "obj", "zip"],
        "bake_priority": "high",
        "is_active": True,
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
    )


def _sync_specs(specs: list[dict]) -> None:
    bind = op.get_bind()
    plans = _plans_table()

    for spec in specs:
        cycle_clause = (
            plans.c.billing_cycle.is_(None)
            if spec["billing_cycle"] is None
            else plans.c.billing_cycle == spec["billing_cycle"]
        )
        plan_id = bind.execute(
            sa.select(plans.c.id).where(
                plans.c.tier == spec["tier"],
                cycle_clause,
            )
        ).scalar_one_or_none()

        if plan_id is None:
            bind.execute(plans.insert().values(id=uuid.uuid4(), **spec))
        else:
            bind.execute(plans.update().where(plans.c.id == plan_id).values(**spec))


def upgrade() -> None:
    _sync_specs(LANDING_PLAN_SPECS)


def downgrade() -> None:
    _sync_specs(PREVIOUS_PLAN_SPECS)
