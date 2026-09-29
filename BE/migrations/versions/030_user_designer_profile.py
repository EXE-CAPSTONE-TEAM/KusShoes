"""users: designer profile fields shown on the web Settings page

Primary role, studio name/location and portfolio handles (Instagram, Behance, TikTok) were
collected by the Settings form but never stored. All optional free text.

Revision ID: 030
Revises: 029
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None

# Same width as first_name/last_name; these are display strings, not identifiers.
_COLUMNS = (
    "designer_role",
    "studio_name",
    "studio_location",
    "instagram_handle",
    "behance_username",
    "tiktok_handle",
)


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column("users", sa.Column(column, sa.String(100), nullable=True))


def downgrade() -> None:
    for column in reversed(_COLUMNS):
        op.drop_column("users", column)
