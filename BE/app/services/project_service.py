import base64
import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    ActionRequiresVerifiedEmail,
    BakeJobNotCancellable,
    BakeJobNotFound,
    BakeJobNotRequeueable,
    DesignLayerLimitExceeded,
    ProjectAccessDenied,
    ProjectBakeInProgress,
    ProjectCursorInvalid,
    ProjectLocked,
    ProjectNotFound,
    ProjectQuotaExceeded,
    ProjectRestoreExpired,
    ProjectTrashNotFound,
    QuotaExportExceeded,
    SubGracePeriodExportBlocked,
)
from app.infrastructure import task_queue
from app.policy import PROJECT_RESTORE_DAYS
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    maintenance_repo,
    project_asset_repo,
    project_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.project import (
    BakeJobResponse,
    BakeJobStatusResponse,
    CreateProjectRequest,
    ExportListResponse,
    ExportResponse,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectResponse,
    ProjectTrashListResponse,
    SaveDesignRequest,
    TrashProjectResponse,
    TriggerBakeRequest,
    UpdateProjectRequest,
)
from app.services import guardrail_service, quota_service, version_service
from app.services.project_access import require_owner

EDITOR_BASE_URL = "https://app.kusshoes.vn/editor"


async def list_projects(
    db: AsyncSession, user, *, limit: int, cursor: str | None
) -> ProjectListResponse:
    decoded = _decode_cursor(cursor) if cursor else None
    projects = await project_repo.list_for_user(db, user.id, limit, decoded)
    has_next = len(projects) > limit
    page = projects[:limit]
    next_cursor = _encode_cursor(page[-1]) if has_next and page else None
    return ProjectListResponse(
        items=[_to_response(project) for project in page],
        next_cursor=next_cursor,
        has_next=has_next,
    )


async def list_trash(
    db: AsyncSession, user, *, limit: int, cursor: str | None
) -> ProjectTrashListResponse:
    decoded = _decode_trash_cursor(cursor) if cursor else None
    projects = await project_repo.list_deleted_for_user(db, user.id, limit, decoded)
    has_next = len(projects) > limit
    page = projects[:limit]
    next_cursor = _encode_trash_cursor(page[-1]) if has_next and page else None
    return ProjectTrashListResponse(
        items=[_to_trash_response(project) for project in page],
        next_cursor=next_cursor,
        has_next=has_next,
    )


async def create_project(
    db: AsyncSession, user, body: CreateProjectRequest
) -> ProjectResponse:
    subscription = await subscription_repo.get_by_user(db, user.id)
    max_projects = subscription.plan.max_projects if subscription else 0
    # BR-46: "dự án lưu tối đa" is a total-inventory cap, not a per-cycle
    # rate — gate on the live count, never on the cycle usage counter.
    live_count = await project_repo.count_for_user(db, user.id)
    if max_projects is not None and live_count >= max_projects:
        raise ProjectQuotaExceeded()
    project = await project_repo.create(
        db,
        user_id=user.id,
        name=body.name.strip(),
        description=body.description,
    )
    await quota_service.increment_projects(db, user.id, subscription, 1)
    return _to_response(project)


async def get_project(db: AsyncSession, user, project_id: uuid.UUID) -> ProjectDetailResponse:
    project = await require_owner(db, project_id, user)
    return _to_detail(project)


async def update_project(
    db: AsyncSession, user, project_id: uuid.UUID, body: UpdateProjectRequest
) -> ProjectResponse:
    project = await require_owner(db, project_id, user)
    if project.is_locked:
        raise ProjectLocked()
    changes = {
        field: value.strip() if field == "name" else value
        for field, value in body.model_dump(exclude_unset=True).items()
    }
    await project_repo.update_fields(db, project, changes)
    return _to_response(project)


async def delete_project(db: AsyncSession, user, project_id: uuid.UUID) -> dict[str, str]:
    project = await require_owner(db, project_id, user)
    if project.is_locked:
        raise ProjectLocked()
    subscription = await subscription_repo.get_by_user(db, user.id)
    await project_repo.soft_delete(db, project)
    await quota_service.increment_projects(db, user.id, subscription, -1)
    await db.commit()
    task_queue.enqueue_project_cleanup(str(project.id), countdown=PROJECT_RESTORE_DAYS * 24 * 3600)
    return {"message": "Đã xóa project"}


async def restore_project(
    db: AsyncSession, user, project_id: uuid.UUID
) -> ProjectResponse:
    project = await project_repo.get_deleted_by_id(db, project_id)
    if not project:
        raise ProjectTrashNotFound()
    if project.user_id != user.id:
        raise ProjectAccessDenied()
    if not project.deleted_at or datetime.now(UTC) >= project.deleted_at + timedelta(
        days=PROJECT_RESTORE_DAYS
    ):
        raise ProjectRestoreExpired()

    subscription = await subscription_repo.get_by_user(db, user.id)
    max_projects = subscription.plan.max_projects if subscription else 0
    live_count = await project_repo.count_for_user(db, user.id)
    if max_projects is not None and live_count >= max_projects:
        raise ProjectQuotaExceeded()

    await project_repo.restore(db, project)
    await quota_service.increment_projects(db, user.id, subscription, 1)
    return _to_response(project)


async def permanently_delete_project(
    db: AsyncSession, user, project_id: uuid.UUID
) -> dict[str, str]:
    project = await project_repo.get_deleted_by_id(db, project_id)
    if not project:
        raise ProjectTrashNotFound()
    if project.user_id != user.id:
        raise ProjectAccessDenied()

    paths = await maintenance_repo.list_project_file_paths(db, project_id)
    await project_repo.clear_canonical_asset(db, project)
    await export_record_repo.delete_for_project(db, project_id)
    await bake_job_repo.delete_for_project(db, project_id)
    await project_asset_repo.delete_for_project(db, project_id)
    await project_repo.hard_delete(db, project)
    await db.commit()
    for path in set(paths):
        task_queue.enqueue_storage_delete(path)
    return {"message": "Đã xóa project vĩnh viễn"}


async def save_design(
    db: AsyncSession, project_id: uuid.UUID, body: SaveDesignRequest
) -> dict[str, str]:
    project = await project_repo.get_by_id(db, project_id)
    if not project:
        raise ProjectNotFound()
    if project.is_locked:
        raise ProjectLocked()
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    max_layers = subscription.plan.max_layers_per_project if subscription else 30
    if count_design_layers(body.design_config) > max_layers:
        raise DesignLayerLimitExceeded()
    await guardrail_service.assert_not_exporting(db, project_id)
    await guardrail_service.check_design(db, body.design_config)
    await project_repo.save_design(
        db,
        project,
        design_config=body.design_config,
        thumbnail_path=body.thumbnail_path,
    )
    await version_service.snapshot(
        db,
        project,
        design_config=body.design_config,
        thumbnail_path=body.thumbnail_path,
    )
    return {"message": "Đã lưu thiết kế"}


def count_design_layers(design_config: object) -> int:
    """Total sticker+text layers (BR-52) — the studio has no per-zone
    grouping today, so only the project-wide cap is enforceable."""
    if not isinstance(design_config, dict):
        return 0
    count = 0
    for key in ("stickers", "texts"):
        value = design_config.get(key)
        if isinstance(value, list):
            count += len(value)
    return count


async def trigger_bake(
    db: AsyncSession, project_id: uuid.UUID, body: TriggerBakeRequest
) -> BakeJobResponse:
    project = await project_repo.get_by_id(db, project_id)
    if not project:
        raise ProjectNotFound()
    if project.is_locked:
        raise ProjectLocked()
    if await bake_job_repo.get_active_for_project(db, project_id):
        raise ProjectBakeInProgress()
    # BR-03: this endpoint runs behind the service token, not get_current_user,
    # so the global email-verification gate never applies here — check directly.
    owner = await user_repo.get_by_id(db, project.user_id)
    if not owner or not owner.is_verified:
        raise ActionRequiresVerifiedEmail()
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    if subscription and subscription.status == "grace":
        raise SubGracePeriodExportBlocked()
    priority = subscription.plan.bake_priority if subscription else "low"
    usage = await quota_service.get_usage(db, project.user_id, subscription)
    formats = subscription.plan.allowed_export_formats if subscription else ["glb"]
    max_exports = subscription.plan.max_exports_per_month if subscription else 0
    if max_exports is not None and usage.exports_count + len(formats) > max_exports:
        raise QuotaExportExceeded()
    await guardrail_service.check_design(db, body.design_config)
    job = await bake_job_repo.create(
        db,
        project_id=project_id,
        design_config=body.design_config,
        priority=priority,
    )
    # BR-46: the exact config sent to the factory is pinned so pruning keeps it.
    await version_service.snapshot(
        db,
        project,
        design_config=body.design_config,
        thumbnail_path=project.thumbnail_path,
        pin=True,
        bake_job_id=job.id,
    )
    await project_repo.set_status(db, project, "baking")
    await db.commit()
    task_queue.enqueue_bake(str(job.id), priority)
    return BakeJobResponse(job_id=job.id, status=job.status, priority=job.priority)


async def get_bake_status(
    db: AsyncSession, user, project_id: uuid.UUID, job_id: uuid.UUID
) -> BakeJobStatusResponse:
    await require_owner(db, project_id, user)
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.project_id != project_id:
        raise BakeJobNotFound()
    return BakeJobStatusResponse(
        job_id=job.id,
        status=job.status,
        priority=job.priority,
        error_message=job.error_message,
        queued_at=job.queued_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        can_retry=job.status == "failed",
        can_cancel=job.status == "queued",
        poll_after_seconds=3 if job.status in {"queued", "processing"} else None,
    )


async def retry_bake(
    db: AsyncSession, user, project_id: uuid.UUID, job_id: uuid.UUID
) -> BakeJobResponse:
    project = await require_owner(db, project_id, user)
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.project_id != project_id:
        raise BakeJobNotFound()
    if job.status != "failed":
        raise BakeJobNotRequeueable()
    if await bake_job_repo.get_active_for_project(db, project_id):
        raise ProjectBakeInProgress()
    await bake_job_repo.mark_requeued(db, job)
    await project_repo.set_status(db, project, "baking")
    await db.commit()
    task_queue.enqueue_bake(str(job.id), job.priority)
    return BakeJobResponse(job_id=job.id, status=job.status, priority=job.priority)


async def cancel_bake(
    db: AsyncSession, user, project_id: uuid.UUID, job_id: uuid.UUID
) -> BakeJobResponse:
    project = await require_owner(db, project_id, user)
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.project_id != project_id:
        raise BakeJobNotFound()
    if job.status != "queued":
        raise BakeJobNotCancellable()
    await bake_job_repo.mark_cancelled(db, job)
    await project_repo.set_status(db, project, "in_progress")
    await db.commit()
    return BakeJobResponse(job_id=job.id, status=job.status, priority=job.priority)


async def list_exports(
    db: AsyncSession, user, project_id: uuid.UUID
) -> ExportListResponse:
    await require_owner(db, project_id, user)
    records = await export_record_repo.list_for_project(db, project_id)
    return ExportListResponse(
        items=[
            ExportResponse(
                id=record.id,
                format=record.format,
                file_size_bytes=record.file_size_bytes,
                download_count=record.download_count,
                created_at=record.created_at,
            )
            for record in records
        ]
    )


def _to_response(project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        is_locked=project.is_locked,
        thumbnail_path=project.thumbnail_path,
        design_config=project.design_config,
        editor_url=f"{EDITOR_BASE_URL}/{project.id}",
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _to_detail(project) -> ProjectDetailResponse:
    return ProjectDetailResponse(
        **_to_response(project).model_dump(),
        canonical_model_asset_id=project.canonical_model_asset_id,
    )


def _to_trash_response(project) -> TrashProjectResponse:
    return TrashProjectResponse(
        **_to_response(project).model_dump(),
        deleted_at=project.deleted_at,
        purge_at=project.deleted_at + timedelta(days=PROJECT_RESTORE_DAYS),
    )


def _encode_cursor(project) -> str:
    payload = json.dumps({"updated_at": project.updated_at.isoformat(), "id": str(project.id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        value = datetime.fromisoformat(payload["updated_at"])
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value, uuid.UUID(payload["id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ProjectCursorInvalid()


def _encode_trash_cursor(project) -> str:
    payload = json.dumps({"deleted_at": project.deleted_at.isoformat(), "id": str(project.id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _decode_trash_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        value = datetime.fromisoformat(payload["deleted_at"])
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value, uuid.UUID(payload["id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ProjectCursorInvalid()
