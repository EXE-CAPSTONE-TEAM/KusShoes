"""016 add design_revisions

Revision ID: 016
Revises: 015
Create Date: 2026-07-19
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "design_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("design_config", postgresql.JSONB, nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client", sa.String(40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.CheckConstraint("revision > 0", name="ck_design_revisions_revision_positive"),
    )
    op.create_index(
        "idx_design_revisions_project_id", "design_revisions", ["project_id", "revision"]
    )
    op.create_unique_constraint(
        "uq_design_revisions_project_revision", "design_revisions", ["project_id", "revision"]
    )

    op.add_column(
        "projects",
        sa.Column("current_design_revision", sa.Integer, nullable=False, server_default="0"),
    )

    # Backfill: projects with an existing design_config become revision 1.
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, design_config, user_id, updated_at FROM projects "
        "WHERE design_config IS NOT NULL"
    )).fetchall()
    insert_stmt = sa.text(
        "INSERT INTO design_revisions "
        "(id, project_id, revision, design_config, author_user_id, client, created_at) "
        "VALUES (:id, :project_id, 1, :design_config, :author_user_id, 'backfill', "
        ":created_at)"
    ).bindparams(sa.bindparam("design_config", type_=postgresql.JSONB))
    for row in rows:
        conn.execute(
            insert_stmt,
            {
                "id": str(uuid.uuid4()),
                "project_id": str(row.id),
                "design_config": row.design_config,
                "author_user_id": str(row.user_id),
                "created_at": row.updated_at,
            },
        )
    if rows:
        conn.execute(sa.text(
            "UPDATE projects SET current_design_revision = 1 WHERE design_config IS NOT NULL"
        ))


def downgrade() -> None:
    op.drop_column("projects", "current_design_revision")
    op.drop_table("design_revisions")
