"""data_imports (BR-20) + export_records.is_watermarked (BR-65)

- BR-20 (SRS_v2.2.txt:1510): a KusShoes backup can be imported as a new copy; every import
  attempt is recorded in ``data_imports`` (pending -> completed | rejected).
- BR-65 (SRS_v2.2.txt:1910): Free renders always carry a watermark; each export row records
  whether its output was produced under the watermark policy.

Every create/add is inspector-guarded, and ``downgrade()`` reverses all of it.

Revision ID: 025
Revises: 024
Create Date: 2026-09-21
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if "data_imports" not in inspector.get_table_names():
        op.create_table(
            "data_imports",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column("storage_path", sa.Text(), nullable=False),
            sa.Column("source_filename", sa.String(255), nullable=True),
            sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
            sa.Column("checksum", sa.String(64), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("rejected_reason", sa.Text(), nullable=True),
            sa.Column("projects_imported", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint(
                "status IN ('pending', 'completed', 'rejected')",
                name="ck_data_imports_status",
            ),
        )
        op.create_index(
            "ix_data_imports_user_created", "data_imports", ["user_id", "created_at"],
            postgresql_ops={"created_at": "DESC"},
        )

    export_columns = {column["name"] for column in inspector.get_columns("export_records")}
    if "is_watermarked" not in export_columns:
        op.add_column(
            "export_records",
            sa.Column("is_watermarked", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    export_columns = {column["name"] for column in inspector.get_columns("export_records")}
    if "is_watermarked" in export_columns:
        op.drop_column("export_records", "is_watermarked")

    if "data_imports" in inspector.get_table_names():
        op.drop_index("ix_data_imports_user_created", table_name="data_imports")
        op.drop_table("data_imports")
