import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bake_job import BakeJob
from app.models.project import Project
from app.types import JsonObject

# A job is "active" while a desktop may still act on it (spec §A.1).
ACTIVE_STATUSES = ("awaiting_client", "claimed")


async def get_by_id(
    db: AsyncSession, job_id: uuid.UUID, *, for_update: bool = False
) -> BakeJob | None:
    query = select(BakeJob).where(BakeJob.id == job_id)
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
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
    db: AsyncSession, project_id: uuid.UUID, *, for_update: bool = False
) -> BakeJob | None:
    """The single active job of a project (partial unique index uq_bake_jobs_active_project)."""
    query = select(BakeJob).where(
        BakeJob.project_id == project_id,
        BakeJob.status.in_(ACTIVE_STATUSES),
    )
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    design_config: JsonObject | None,
    priority: str,
    kind: str = "bake",
    source_asset_id: uuid.UUID | None = None,
    crop_box: JsonObject | None = None,
) -> BakeJob:
    job = BakeJob(
        project_id=project_id,
        kind=kind,
        design_config_snapshot=design_config,
        status="awaiting_client",
        priority=priority,
        source_asset_id=source_asset_id,
        crop_box=crop_box,
    )
    db.add(job)
    await db.flush()
    return job


async def claim(
    db: AsyncSession,
    job_id: uuid.UUID,
    *,
    claim_id: uuid.UUID,
    claim_token_hash: str,
    lease_seconds: int,
    worker_id: str | None,
) -> BakeJob | None:
    """Atomically hand the job to one desktop (spec §A.3).

    Succeeds only for an unclaimed job or one whose lease has expired; a concurrent claimer
    gets no row back. The caller reads the previous claim's ``issued_outputs`` beforehand so
    it can delete those staging keys once this returns.
    """
    now = datetime.now(UTC)
    result = await db.execute(
        update(BakeJob)
        .where(
            BakeJob.id == job_id,
            or_(
                BakeJob.status == "awaiting_client",
                and_(BakeJob.status == "claimed", BakeJob.claim_expires_at < now),
            ),
        )
        .values(
            status="claimed",
            claim_id=claim_id,
            claim_token_hash=claim_token_hash,
            claim_expires_at=now + timedelta(seconds=lease_seconds),
            started_at=now,
            worker_id=worker_id,
            issued_outputs=None,
        )
        .returning(BakeJob.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        return None
    job = await get_by_id(db, job_id)
    if job is not None:
        await db.refresh(job)
    return job


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
            query = query.where(
                or_(
                    BakeJob.queued_at < before,
                    and_(
                        BakeJob.queued_at == before,
                        BakeJob.id < before_id,
                    ),
                )
            )
        else:
            query = query.where(BakeJob.queued_at < before)
    query = query.order_by(BakeJob.queued_at.desc(), BakeJob.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(job, project_name) for job, project_name in result.all()]


async def mark_requeued(db: AsyncSession, job: BakeJob) -> None:
    """Return a failed job to the desktop queue (retry/requeue, spec §B.4)."""
    job.status = "awaiting_client"
    job.error_message = None
    job.worker_id = None
    job.started_at = None
    job.completed_at = None
    job.claim_id = None
    job.claim_token_hash = None
    job.claim_expires_at = None
    job.issued_outputs = None
    job.result = None
    job.queued_at = datetime.now(UTC)
    await db.flush()


async def mark_cancelled(db: AsyncSession, job: BakeJob) -> None:
    job.status = "cancelled"
    job.completed_at = datetime.now(UTC)
    await db.flush()


async def delete_for_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    await db.execute(delete(BakeJob).where(BakeJob.project_id == project_id))


async def get_recent_active_for_project(
    db: AsyncSession, project_id: uuid.UUID, since: datetime
) -> BakeJob | None:
    """Active bake job queued after `since` — BR-45 edit lock window."""
    result = await db.execute(
        select(BakeJob)
        .where(
            BakeJob.project_id == project_id,
            BakeJob.kind == "bake",
            BakeJob.status.in_(ACTIVE_STATUSES),
            BakeJob.queued_at >= since,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()
