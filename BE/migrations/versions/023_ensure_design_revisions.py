"""ensure design_revisions exists (repairs the duplicate 016 revision)

Two migrations were both numbered 016: one created design_revisions, the other synced plan
pricing. Databases that ran only the pricing one report revision 016 but lack the table, so
this migration creates it when it is missing. It is a no-op everywhere else.

Revision ID: 023
Revises: 022
Create Date: 2026-09-22
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "design_revisions" not in inspector.get_table_names():
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
    project_columns = {column["name"] for column in inspector.get_columns("projects")}
    if "current_design_revision" not in project_columns:
        op.add_column(
            "projects",
            sa.Column("current_design_revision", sa.Integer, nullable=False, server_default="0"),
        )


def downgrade() -> None:
    # Nothing to undo: the objects belong to revision 016 on databases that already had them.
    pass
