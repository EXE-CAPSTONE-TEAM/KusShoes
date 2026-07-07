import uuid
from datetime import datetime

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.export_record import ExportRecord
from app.models.project import Project
from app.models.user import User


async def list_for_project(db: AsyncSession, project_id: uuid.UUID) -> list[ExportRecord]:
    result = await db.execute(
        select(ExportRecord)
        .where(ExportRecord.project_id == project_id)
        .order_by(ExportRecord.created_at.desc(), ExportRecord.id.desc())
    )
    return list(result.scalars())


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None,
    format: str | None,
    limit: int,
    cursor: tuple[datetime, uuid.UUID] | None,
) -> list[tuple[ExportRecord, str]]:
    from app.models.project import Project

    query = (
        select(ExportRecord, Project.name)
        .join(Project, Project.id == ExportRecord.project_id)
        .where(ExportRecord.user_id == user_id)
    )
    if project_id is not None:
        query = query.where(ExportRecord.project_id == project_id)
    if format is not None:
        query = query.where(ExportRecord.format == format)
    if cursor:
        cursor_time, cursor_id = cursor
        query = query.where(
            or_(
                ExportRecord.created_at < cursor_time,
                and_(
                    ExportRecord.created_at == cursor_time,
                    ExportRecord.id < cursor_id,
                ),
            )
        )
    result = await db.execute(
        query.order_by(ExportRecord.created_at.desc(), ExportRecord.id.desc()).limit(limit + 1)
    )
    return [(record, project_name) for record, project_name in result.all()]


async def get_for_user(
    db: AsyncSession, export_id: uuid.UUID, user_id: uuid.UUID
) -> ExportRecord | None:
    result = await db.execute(
        select(ExportRecord).where(
            ExportRecord.id == export_id,
            ExportRecord.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def increment_download_count(db: AsyncSession, record: ExportRecord) -> None:
    record.download_count += 1
    await db.flush()


async def delete_for_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    await db.execute(delete(ExportRecord).where(ExportRecord.project_id == project_id))


async def create_many(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    bake_job_id: uuid.UUID,
    user_id: uuid.UUID,
    exports: list[dict],
) -> list[ExportRecord]:
    records = [
        ExportRecord(
            project_id=project_id,
            bake_job_id=bake_job_id,
            user_id=user_id,
            format=item["format"],
            file_path=item["file_path"],
            file_size_bytes=item.get("file_size_bytes"),
        )
        for item in exports
    ]
    db.add_all(records)
    await db.flush()
    return records


async def list_admin(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    format: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[ExportRecord, str | None, str | None]]:
    query = (
        select(ExportRecord, Project.name, User.email)
        .outerjoin(Project, Project.id == ExportRecord.project_id)
        .outerjoin(User, User.id == ExportRecord.user_id)
    )
    if user_id is not None:
        query = query.where(ExportRecord.user_id == user_id)
    if project_id is not None:
        query = query.where(ExportRecord.project_id == project_id)
    if format is not None:
        query = query.where(ExportRecord.format == format)
    if before is not None:
        if before_id is not None:
            query = query.where((ExportRecord.created_at < before) | ((ExportRecord.created_at == before) & (ExportRecord.id < before_id)))
        else:
            query = query.where(ExportRecord.created_at < before)
    query = query.order_by(ExportRecord.created_at.desc(), ExportRecord.id.desc()).limit(limit)
    result = await db.execute(query)
    return [
        (record, project_name, user_email)
        for record, project_name, user_email in result.all()
    ]
