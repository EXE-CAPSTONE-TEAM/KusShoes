"""account & security: privacy, 2FA, consent, login history, attribution

Revision ID: 019
Revises: 018
Create Date: 2026-09-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users: BR-83 internal flag ---
    op.add_column(
        "users", sa.Column("is_internal", sa.Boolean(), nullable=False, server_default="false")
    )

    # --- users: BR-15 privacy (off by default) ---
    for column in (
        "is_profile_public",
        "show_designs_publicly",
        "is_searchable",
        "allow_analytics",
        "allow_ads_personalization",
    ):
        op.add_column(
            "users", sa.Column(column, sa.Boolean(), nullable=False, server_default="false")
        )

    # --- users: BR-10 username cooldown + case-insensitive uniqueness ---
    op.add_column(
        "users", sa.Column("username_changed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "uq_users_username_lower", "users", [sa.text("lower(username)")], unique=True
    )

    # --- users: BR-12/13 2FA ---
    op.add_column(
        "users",
        sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("users", sa.Column("two_factor_method", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("recovery_email", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "recovery_email_verified", sa.Boolean(), nullable=False, server_default="false"
        ),
    )

    # --- users: BR-84/85 attribution ---
    op.add_column("users", sa.Column("acquisition_channel", sa.String(30), nullable=True))
    op.add_column("users", sa.Column("utm_source", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("utm_campaign", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("referral_code", sa.String(30), nullable=True))

    # --- consent_records (BR-89) ---
    op.create_table(
        "consent_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("doc_version", sa.String(20), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False, server_default="web"),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "type IN ('tos', 'privacy_policy', 'age_confirmation', "
            "'marketing_content', 'academic_report', 'cookie_analytics')",
            name="ck_consent_records_type",
        ),
    )
    op.create_index("idx_consent_records_user_id", "consent_records", ["user_id"])

    # --- login_history (BR-18) ---
    op.create_table(
        "login_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True,
        ),
        sa.Column("email_attempted", sa.String(255), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "idx_login_history_user_created", "login_history", ["user_id", "created_at"]
    )

    # --- recovery_codes (2FA, BR-12) ---
    op.create_table(
        "recovery_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_recovery_codes_user_id", "recovery_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_recovery_codes_user_id", table_name="recovery_codes")
    op.drop_table("recovery_codes")

    op.drop_index("idx_login_history_user_created", table_name="login_history")
    op.drop_table("login_history")

    op.drop_index("idx_consent_records_user_id", table_name="consent_records")
    op.drop_table("consent_records")

    op.drop_column("users", "referral_code")
    op.drop_column("users", "utm_campaign")
    op.drop_column("users", "utm_source")
    op.drop_column("users", "acquisition_channel")

    op.drop_column("users", "recovery_email_verified")
    op.drop_column("users", "recovery_email")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "two_factor_method")
    op.drop_column("users", "two_factor_enabled")

    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_column("users", "username_changed_at")

    for column in (
        "allow_ads_personalization",
        "allow_analytics",
        "is_searchable",
        "show_designs_publicly",
        "is_profile_public",
    ):
        op.drop_column("users", column)

    op.drop_column("users", "is_internal")
