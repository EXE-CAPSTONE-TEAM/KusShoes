"""Track C — BR-77 content_reports/moderation_actions, SF-14 api_cost_entries/api_budget_periods

- content_reports / moderation_actions: BR-77 three-level violation ladder and UC-24
  copyright-complaint intake (SRS_v2.2.txt:2042, :193).
- api_cost_entries / api_budget_periods: SF-14 / BR-79 per-call API cost ledger (failures
  included) and the Admin-configurable monthly budget (SRS_v2.2.txt:1767, :631), read by the
  BR-108 daily CSV report (SRS_v2.2.txt:2112).

Every create is guarded by the inspector (as 023 does) so re-running on a database that already
has a table is a no-op; downgrade drops children before parents.

Revision ID: 026
Revises: 025
Create Date: 2026-09-21
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "content_reports" not in existing:
        op.create_table(
            "content_reports",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "project_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column(
                "template_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("design_templates.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column(
                "reported_user_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column("reporter_email", sa.String(255), nullable=True),
            sa.Column("reporter_name", sa.String(120), nullable=True),
            sa.Column("reason", sa.String(20), nullable=False),
            sa.Column("details", sa.Text(), nullable=False),
            sa.Column("evidence_url", sa.Text(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="new"),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column(
                "reviewed_by", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "reason IN ('copyright', 'trademark', 'inappropriate', 'other')",
                name="ck_content_reports_reason",
            ),
            sa.CheckConstraint(
                "status IN ('new', 'reviewing', 'upheld', 'dismissed')",
                name="ck_content_reports_status",
            ),
            sa.CheckConstraint(
                "(project_id IS NOT NULL) <> (template_id IS NOT NULL)",
                name="ck_content_reports_single_target",
            ),
        )
        op.create_index(
            "ix_content_reports_status_created", "content_reports", ["status", "created_at"],
            postgresql_ops={"created_at": "DESC"},
        )
        op.create_index(
            "ix_content_reports_reported_user", "content_reports", ["reported_user_id"]
        )

    if "moderation_actions" not in existing:
        op.create_table(
            "moderation_actions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column(
                "report_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("content_reports.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("level", sa.SmallInteger(), nullable=False),
            sa.Column("action", sa.String(30), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("restricted_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_by", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("level IN (1, 2, 3)", name="ck_moderation_actions_level"),
            sa.CheckConstraint(
                "action IN ('warning', 'share_restriction', 'ban')",
                name="ck_moderation_actions_action",
            ),
        )
        op.create_index(
            "ix_moderation_actions_user_created", "moderation_actions",
            ["user_id", "created_at"],
            postgresql_ops={"created_at": "DESC"},
        )
        op.create_index(
            "ix_moderation_actions_restriction", "moderation_actions",
            ["user_id", "restricted_until"],
        )

    if "api_cost_entries" not in existing:
        op.create_table(
            "api_cost_entries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("provider", sa.String(30), nullable=False),
            sa.Column("operation", sa.String(50), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("cost_vnd", sa.Integer(), nullable=False),
            sa.Column("reference", sa.String(100), nullable=True),
            sa.Column("occurred_on", sa.Date(), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "status IN ('success', 'failed')", name="ck_api_cost_entries_status"
            ),
            sa.CheckConstraint("cost_vnd >= 0", name="ck_api_cost_entries_cost"),
        )
        op.create_index("ix_api_cost_entries_day", "api_cost_entries", ["occurred_on"])
        op.create_index(
            "ix_api_cost_entries_user_day", "api_cost_entries", ["user_id", "occurred_on"]
        )
        op.create_index(
            "ix_api_cost_entries_user_operation", "api_cost_entries", ["user_id", "operation"]
        )

    if "api_budget_periods" not in existing:
        op.create_table(
            "api_budget_periods",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("period_month", sa.Date(), nullable=False),
            sa.Column("budget_vnd", sa.Integer(), nullable=False),
            sa.Column("warned_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("period_month", name="uq_api_budget_periods_month"),
            sa.CheckConstraint("budget_vnd >= 0", name="ck_api_budget_periods_budget"),
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    # moderation_actions references content_reports, so it is dropped first. Dropping a table
    # drops its own indexes and constraints with it.
    for table in (
        "moderation_actions",
        "content_reports",
        "api_cost_entries",
        "api_budget_periods",
    ):
        if table in existing:
            op.drop_table(table)
