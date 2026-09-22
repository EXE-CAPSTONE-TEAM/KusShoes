"""SQL for BR-20 data-import attempts (``data_imports``)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_import import DataImport


async def create_pending(
    db: AsyncSession, *, import_id: uuid.UUID, user_id: uuid.UUID, storage_path: str
) -> DataImport:
    row = DataImport(
        id=import_id, user_id=user_id, storage_path=storage_path, status="pending"
    )
    db.add(row)
    await db.flush()
    return row


async def get_for_user(
    db: AsyncSession, import_id: uuid.UUID, user_id: uuid.UUID, *, for_update: bool = False
) -> DataImport | None:
    query = select(DataImport).where(
        DataImport.id == import_id, DataImport.user_id == user_id
    )
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_for_user(db: AsyncSession, user_id: uuid.UUID, limit: int) -> list[DataImport]:
    result = await db.execute(
        select(DataImport)
        .where(DataImport.user_id == user_id)
        .order_by(DataImport.created_at.desc(), DataImport.id.desc())
        .limit(limit)
    )
    return list(result.scalars())


async def mark_completed(
    db: AsyncSession,
    row: DataImport,
    *,
    projects_imported: int,
    file_size_bytes: int,
    checksum: str,
) -> None:
    row.status = "completed"
    row.projects_imported = projects_imported
    row.file_size_bytes = file_size_bytes
    row.checksum = checksum
    row.completed_at = datetime.now(UTC)
    await db.flush()


async def mark_rejected(
    db: AsyncSession, row: DataImport, *, reason: str, file_size_bytes: int | None
) -> None:
    row.status = "rejected"
    row.rejected_reason = reason
    if file_size_bytes is not None:
        row.file_size_bytes = file_size_bytes
    await db.flush()
