"""add is_verified and role to users

Revision ID: 012
Revises: 011
Create Date: 2026-06-21
"""
import sqlalchemy as sa
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="FALSE"),
    )
    op.add_column(
        "users",
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
    )
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('user', 'admin', 'staff')",
    )
    op.create_index(
        "idx_users_role",
        "users",
        ["role"],
        postgresql_where=sa.text("role != 'user'"),
    )


def downgrade() -> None:
    op.drop_index("idx_users_role", table_name="users")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.drop_column("users", "role")
    op.drop_column("users", "is_verified")
