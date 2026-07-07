"""normalize schema — storage rule, redundant columns, constraints, indexes

Revision ID: 011
Revises: 010
Create Date: 2026-06-21

Changes:
  1. users.avatar_url → avatar_path (storage rule: store path, not URL)
  2. projects.thumbnail_url → thumbnail_path (same)
  3. subscriptions: remove billing_cycle (derivable from plan), plan_id NOT NULL
  4. bake_jobs: remove result_*_path columns (redundant with export_records)
  5. Add missing CHECK constraints: subscriptions, plans, invoices
  6. Add UNIQUE (tier, billing_cycle) on plans
  7. Drop useless idx_users_active (indexes PK — already indexed)
  8. Add missing indexes: refresh_tokens, invoices, export_records, bake_jobs, subscriptions
"""

import sqlalchemy as sa
from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. users: rename avatar_url → avatar_path ──────────────────────────
    op.alter_column("users", "avatar_url", new_column_name="avatar_path")

    # ── 2. projects: rename thumbnail_url → thumbnail_path ─────────────────
    op.alter_column("projects", "thumbnail_url", new_column_name="thumbnail_path")

    # ── 3. subscriptions ───────────────────────────────────────────────────
    # Remove billing_cycle (derivable from plan)
    op.drop_column("subscriptions", "billing_cycle")

    # Make plan_id NOT NULL — every subscription must reference a plan
    # (Free users reference the free plan seeded in migration 003)
    op.execute("""
        UPDATE subscriptions
        SET plan_id = (SELECT id FROM plans WHERE tier = 'free' LIMIT 1)
        WHERE plan_id IS NULL
    """)
    op.alter_column("subscriptions", "plan_id", nullable=False)

    # Drop old constraints (created in 004) then re-create with updated values
    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.drop_constraint("ck_subscriptions_tier", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status",
        "subscriptions",
        "status IN ('active', 'cancelled', 'expired')",
    )
    op.create_check_constraint(
        "ck_subscriptions_tier",
        "subscriptions",
        "tier IN ('free', 'creator_monthly', 'creator_yearly', 'pro_monthly', 'pro_yearly')",
    )

    # ── 4. bake_jobs: remove redundant result paths ─────────────────────────
    # Output files are already tracked in export_records (file_path + format)
    op.drop_column("bake_jobs", "result_glb_path")
    op.drop_column("bake_jobs", "result_obj_path")
    op.drop_column("bake_jobs", "result_zip_path")

    # ── 5. plans: CHECK constraints + UNIQUE ───────────────────────────────
    op.create_check_constraint(
        "ck_plans_bake_priority",
        "plans",
        "bake_priority IN ('low', 'normal', 'high')",
    )
    op.create_check_constraint(
        "ck_plans_billing_cycle",
        "plans",
        "billing_cycle IN ('monthly', 'yearly') OR billing_cycle IS NULL",
    )
    # Prevent duplicate (tier, billing_cycle) combinations
    op.create_unique_constraint(
        "uq_plans_tier_billing_cycle",
        "plans",
        ["tier", "billing_cycle"],
    )

    # ── 6. invoices: CHECK constraints ─────────────────────────────────────
    # Drop old constraints (created in 006) then re-create with updated values
    op.drop_constraint("ck_invoices_status", "invoices", type_="check")
    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_status",
        "invoices",
        "status IN ('pending', 'paid', 'failed', 'refunded')",
    )
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IN ('vnpay', 'momo', 'bank_transfer')",
    )

    # ── 7. Fix indexes ──────────────────────────────────────────────────────
    # Drop useless index (indexes PK `id` which is already a B-tree by default)
    op.drop_index("idx_users_active", table_name="users")

    # users — partial indexes for common login/auth lookups
    op.create_index(
        "idx_users_email_active",
        "users",
        ["email"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_users_username_active",
        "users",
        ["username"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # refresh_tokens — token rotation & revoke-all-for-user
    op.create_index(
        "idx_refresh_tokens_user_valid",
        "refresh_tokens",
        ["user_id"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    # invoices — billing history per user
    op.create_index(
        "idx_invoices_user_created",
        "invoices",
        ["user_id", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )

    # export_records — lookup by bake job (primary access pattern)
    op.create_index(
        "idx_export_records_bake_job",
        "export_records",
        ["bake_job_id", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )

    # bake_jobs — check if project has active bake before triggering new one
    op.create_index(
        "idx_bake_jobs_project_active",
        "bake_jobs",
        ["project_id"],
        postgresql_where=sa.text("status IN ('queued', 'processing')"),
    )

    # subscriptions — plan FK lookup (JOIN plans → subscriptions)
    op.create_index(
        "idx_subscriptions_plan_id",
        "subscriptions",
        ["plan_id"],
    )


def downgrade() -> None:
    # Indexes
    op.drop_index("idx_subscriptions_plan_id", table_name="subscriptions")
    op.drop_index("idx_bake_jobs_project_active", table_name="bake_jobs")
    op.drop_index("idx_export_records_bake_job", table_name="export_records")
    op.drop_index("idx_invoices_user_created", table_name="invoices")
    op.drop_index("idx_refresh_tokens_user_valid", table_name="refresh_tokens")
    op.drop_index("idx_users_username_active", table_name="users")
    op.drop_index("idx_users_email_active", table_name="users")

    # Restore old useless index (for clean rollback)
    op.create_index(
        "idx_users_active", "users", ["id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # invoices constraints — restore to pre-011 values (as created by migration 006)
    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.drop_constraint("ck_invoices_status", "invoices", type_="check")
    op.create_check_constraint(
        "ck_invoices_status", "invoices", "status IN ('pending', 'paid', 'failed', 'refunded')"
    )
    op.create_check_constraint(
        "ck_invoices_payment_method", "invoices", "payment_method IN ('payos', 'vnpay', 'momo')"
    )

    # plans constraints
    op.drop_constraint("uq_plans_tier_billing_cycle", "plans", type_="unique")
    op.drop_constraint("ck_plans_billing_cycle", "plans", type_="check")
    op.drop_constraint("ck_plans_bake_priority", "plans", type_="check")

    # bake_jobs — restore result path columns
    op.add_column("bake_jobs", sa.Column("result_glb_path", sa.Text, nullable=True))
    op.add_column("bake_jobs", sa.Column("result_obj_path", sa.Text, nullable=True))
    op.add_column("bake_jobs", sa.Column("result_zip_path", sa.Text, nullable=True))

    # subscriptions constraints — restore to pre-011 values (as created by migration 004)
    op.drop_constraint("ck_subscriptions_tier", "subscriptions", type_="check")
    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status", "subscriptions", "status IN ('active', 'expired', 'cancelled')"
    )
    op.create_check_constraint(
        "ck_subscriptions_tier", "subscriptions", "tier IN ('free', 'creator', 'pro')"
    )
    op.alter_column("subscriptions", "plan_id", nullable=True)
    op.add_column(
        "subscriptions",
        sa.Column("billing_cycle", sa.String(20), nullable=True),
    )

    # projects rename back
    op.alter_column("projects", "thumbnail_path", new_column_name="thumbnail_url")

    # users rename back
    op.alter_column("users", "avatar_path", new_column_name="avatar_url")
