import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bake_job import BakeJob
from app.models.project import Project


async def get_by_id(db: AsyncSession, job_id: uuid.UUID) -> BakeJob | None:
    result = await db.execute(select(BakeJob).where(BakeJob.id == job_id))
    return result.scalar_one_or_none()


async def get_admin_by_id(
    db: AsyncSession, job_id: uuid.UUID
) -> tuple[BakeJob, str | None] | None:
    result = await db.execute(
        select(BakeJob, Project.name)
        .outerjoin(Project, Project.id == BakeJob.project_id)
        .where(BakeJob.id == job_id)
    )
    row = result.one_or_none()
    return (row[0], row[1]) if row else None


async def get_active_for_project(
    db: AsyncSession, project_id: uuid.UUID
) -> BakeJob | None:
    result = await db.execute(
        select(BakeJob).where(
            BakeJob.project_id == project_id,
            BakeJob.status.in_(["queued", "processing"]),
        )
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    design_config: dict,
    priority: str,
) -> BakeJob:
    job = BakeJob(
        project_id=project_id,
        design_config_snapshot=design_config,
        status="queued",
        priority=priority,
    )
    db.add(job)
    await db.flush()
    return job


def mark_processing(job: BakeJob, worker_id: str | None) -> None:
    job.status = "processing"
    job.started_at = datetime.now(UTC)
    job.worker_id = worker_id


def mark_completed(job: BakeJob) -> None:
    job.status = "completed"
    job.completed_at = datetime.now(UTC)
    job.error_message = None


def mark_failed(job: BakeJob, message: str) -> None:
    job.status = "failed"
    job.completed_at = datetime.now(UTC)
    job.error_message = message[:2000]


async def get_latest_for_project(db: AsyncSession, project_id: uuid.UUID) -> BakeJob | None:
    result = await db.execute(
        select(BakeJob)
        .where(BakeJob.project_id == project_id)
        .order_by(BakeJob.queued_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_admin(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    project_id: uuid.UUID | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[BakeJob, str | None]]:
    query = select(BakeJob, Project.name).outerjoin(Project, Project.id == BakeJob.project_id)
    if status is not None:
        query = query.where(BakeJob.status == status)
    if priority is not None:
        query = query.where(BakeJob.priority == priority)
    if project_id is not None:
        query = query.where(BakeJob.project_id == project_id)
    if before is not None:
        if before_id is not None:
            query = query.where((BakeJob.queued_at < before) | ((BakeJob.queued_at == before) & (BakeJob.id < before_id)))
        else:
            query = query.where(BakeJob.queued_at < before)
    query = query.order_by(BakeJob.queued_at.desc(), BakeJob.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(job, project_name) for job, project_name in result.all()]


async def mark_requeued(db: AsyncSession, job: BakeJob) -> None:
    job.status = "queued"
    job.error_message = None
    job.worker_id = None
    job.started_at = None
    job.completed_at = None
    job.queued_at = datetime.now(UTC)
    await db.flush()


async def mark_cancelled(db: AsyncSession, job: BakeJob) -> None:
    job.status = "cancelled"
    job.completed_at = datetime.now(UTC)
    await db.flush()


async def delete_for_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    await db.execute(delete(BakeJob).where(BakeJob.project_id == project_id))
