"""001 create users

Revision ID: 001
Revises:
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS user_account_seq START 1")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_code", sa.String(20), unique=True, nullable=False),
        sa.Column("google_id", sa.String(100), unique=True, nullable=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("username", sa.String(50), unique=True, nullable=False),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("phone_number", sa.String(20), nullable=True),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column("language", sa.String(10), nullable=False, server_default="vi"),
        sa.Column(
            "preferred_styles",
            postgresql.ARRAY(sa.String),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="ck_users_status"),
    )

    op.create_index("idx_users_google_id", "users", ["google_id"],
                    unique=True, postgresql_where=sa.text("google_id IS NOT NULL"))
    op.create_index("idx_users_active", "users", ["id"],
                    postgresql_where=sa.text("deleted_at IS NULL"))


def downgrade() -> None:
    op.drop_table("users")
    op.execute("DROP SEQUENCE IF EXISTS user_account_seq")
