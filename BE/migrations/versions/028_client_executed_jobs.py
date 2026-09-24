"""Client-executed 3D jobs — bake/prepare run on KusStudio Desktop (spec §A, §C, ADR-001/005/009)

- bake_jobs: `kind` (bake|prepare), the source model the job was created against, the
  claim lease (claim id, SHA-256 of the claim token, expiry), the staging keys issued with the
  claim, the crop box for prepare jobs and the stored result that makes complete idempotent.
- Statuses become awaiting_client | claimed | completed | failed | cancelled. Server-side bake is
  retired, so legacy queued/processing rows are failed before the new CHECK is installed.
- At most one active (awaiting_client/claimed) job per project, across both kinds.
- project_assets: `raw` status for scan output that still needs desktop preparation, and
  `derived_from_asset_id` linking a prepared model to its raw scan.

Revision ID: 028
Revises: 027
Create Date: 2026-09-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bake_jobs",
        sa.Column("kind", sa.String(20), nullable=False, server_default="bake"),
    )
    op.add_column(
        "bake_jobs",
        sa.Column(
            "source_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("bake_jobs", sa.Column("claim_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("bake_jobs", sa.Column("claim_token_hash", sa.String(64), nullable=True))
    op.add_column(
        "bake_jobs", sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("bake_jobs", sa.Column("issued_outputs", postgresql.JSONB, nullable=True))
    op.add_column("bake_jobs", sa.Column("crop_box", postgresql.JSONB, nullable=True))
    op.add_column("bake_jobs", sa.Column("result", postgresql.JSONB, nullable=True))
    op.alter_column("bake_jobs", "design_config_snapshot", nullable=True)

    op.execute(
        "UPDATE bake_jobs SET status = 'failed', completed_at = now(), "
        "error_message = 'server-side bake retired' "
        "WHERE status IN ('queued', 'processing')"
    )
    op.drop_constraint("ck_bake_jobs_status", "bake_jobs", type_="check")
    op.create_check_constraint(
        "ck_bake_jobs_status",
        "bake_jobs",
        "status IN ('awaiting_client', 'claimed', 'completed', 'failed', 'cancelled')",
    )
    op.create_check_constraint("ck_bake_jobs_kind", "bake_jobs", "kind IN ('bake', 'prepare')")
    op.create_check_constraint(
        "ck_bake_jobs_design_snapshot",
        "bake_jobs",
        "kind = 'prepare' OR design_config_snapshot IS NOT NULL",
    )
    op.create_index(
        "uq_bake_jobs_active_project",
        "bake_jobs",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('awaiting_client', 'claimed')"),
    )

    op.add_column(
        "project_assets",
        sa.Column(
            "derived_from_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.drop_constraint("ck_project_assets_status", "project_assets", type_="check")
    op.create_check_constraint(
        "ck_project_assets_status",
        "project_assets",
        "status IN ('uploading', 'processing', 'ready', 'raw', 'failed')",
    )


def downgrade() -> None:
    op.execute("UPDATE project_assets SET status = 'ready' WHERE status = 'raw'")
    op.drop_constraint("ck_project_assets_status", "project_assets", type_="check")
    op.create_check_constraint(
        "ck_project_assets_status",
        "project_assets",
        "status IN ('uploading', 'processing', 'ready', 'failed')",
    )
    op.drop_column("project_assets", "derived_from_asset_id")

    op.drop_index("uq_bake_jobs_active_project", table_name="bake_jobs")
    op.drop_constraint("ck_bake_jobs_design_snapshot", "bake_jobs", type_="check")
    op.drop_constraint("ck_bake_jobs_kind", "bake_jobs", type_="check")
    op.execute("UPDATE bake_jobs SET status = 'failed' WHERE status IN ('awaiting_client', 'claimed')")
    op.execute("DELETE FROM bake_jobs WHERE kind = 'prepare'")
    op.drop_constraint("ck_bake_jobs_status", "bake_jobs", type_="check")
    op.create_check_constraint(
        "ck_bake_jobs_status",
        "bake_jobs",
        "status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')",
    )
    op.alter_column("bake_jobs", "design_config_snapshot", nullable=False)
    for column in (
        "result",
        "crop_box",
        "issued_outputs",
        "claim_expires_at",
        "claim_token_hash",
        "claim_id",
        "source_asset_id",
        "kind",
    ):
        op.drop_column("bake_jobs", column)
