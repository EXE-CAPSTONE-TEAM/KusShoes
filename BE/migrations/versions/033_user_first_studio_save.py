"""users.first_studio_save_at: gate feedback on real Studio usage

Feedback is only accepted from accounts that have saved at least one design in KusStudio,
so ratings come from people who actually used the product. Existing users are backfilled
from the earliest Studio save they authored: the app.policy.STUDIO_SAVE_CLIENTS revisions,
plus 016's 'backfill' rows, which hold designs saved before revisions were tracked (back
then the Studio save was the only writer of a design).

Revision ID: 033
Revises: 032
Create Date: 2026-10-23
"""
import sqlalchemy as sa
from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("first_studio_save_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        """
        UPDATE users
        SET first_studio_save_at = first_save.created_at
        FROM (
            SELECT author_user_id, MIN(created_at) AS created_at
            FROM design_revisions
            WHERE client IN ('editor', 'service', 'backfill')
            GROUP BY author_user_id
        ) AS first_save
        WHERE users.id = first_save.author_user_id
        """
    )


def downgrade() -> None:
    op.drop_column("users", "first_studio_save_at")
