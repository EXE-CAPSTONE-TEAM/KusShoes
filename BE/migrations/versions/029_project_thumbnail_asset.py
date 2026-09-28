"""project_assets: `thumbnail` asset type for the project-list card image

The mobile app renders an image of the scanned model and uploads it through the regular asset
upload/confirm flow; confirming it sets projects.thumbnail_path.

Revision ID: 029
Revises: 028
Create Date: 2026-09-29
"""
from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None

_TYPES = "'source_model', 'sticker', 'texture', 'reference_image'"


def upgrade() -> None:
    op.drop_constraint("ck_project_assets_type", "project_assets", type_="check")
    op.create_check_constraint(
        "ck_project_assets_type",
        "project_assets",
        f"asset_type IN ({_TYPES}, 'thumbnail')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE projects SET thumbnail_path = NULL WHERE thumbnail_path IN "
        "(SELECT file_path FROM project_assets WHERE asset_type = 'thumbnail')"
    )
    op.execute("DELETE FROM project_assets WHERE asset_type = 'thumbnail'")
    op.drop_constraint("ck_project_assets_type", "project_assets", type_="check")
    op.create_check_constraint(
        "ck_project_assets_type",
        "project_assets",
        f"asset_type IN ({_TYPES})",
    )
