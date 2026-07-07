import uuid
from datetime import UTC, date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AdminCannotModifyPrivileged,
    AdminUserNotFound,
    BakeJobNotCancellable,
    BakeJobNotFound,
    BakeJobNotRequeueable,
    EmailAlreadyTaken,
    PlanUpdateInvalid,
    ProjectBakeInProgress,
    ProjectNotFound,
    SubPlanNotFound,
    UsernameAlreadyTaken,
)
from app.infrastructure import storage, task_queue
from app.models.plan import Plan
from app.models.user import User
from app.repositories import (
    audit_log_repo,
    bake_job_repo,
    export_record_repo,
    monthly_usage_repo,
    plan_repo,
    project_asset_repo,
    project_repo,
    stats_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.admin import (
    AdminBakeJobDetailResponse,
    AdminBakeJobResponse,
    AdminExportRecordResponse,
    AdminProjectDetailResponse,
    AdminProjectListItem,
    AdminRecentUserItem,
    AdminStatsResponse,
    AdminUserDetailResponse,
    AuditLogResponse,
    MonthlyPoint,
    SystemHealthResponse,
)
from app.services.audit import record_audit
from app.utils.password import hash_password


def _month_buckets(months: int) -> list[date]:
    """Danh sách ngày đầu tháng, từ (months-1) tháng trước đến tháng hiện tại."""
    now = datetime.now(UTC)
    year, month = now.year, now.month
    buckets: list[date] = []
    for _ in range(months):
        buckets.append(date(year, month, 1))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(buckets))


def _zero_fill(rows: list[tuple[date, int]], months: int) -> list[MonthlyPoint]:
    values = dict(rows)
    return [MonthlyPoint(month=m, value=values.get(m, 0)) for m in _month_buckets(months)]


# --- Dashboard ---


async def get_dashboard_stats(db: AsyncSession) -> AdminStatsResponse:
    return AdminStatsResponse(
        total_users=await stats_repo.count_users(db),
        mrr_vnd=await stats_repo.current_mrr_vnd(db),
        total_exports=await stats_repo.count_exports(db),
    )


async def get_revenue_series(db: AsyncSession, *, months: int = 12) -> list[MonthlyPoint]:
    rows = await stats_repo.revenue_by_month(db, months=months)
    return _zero_fill(rows, months)


async def get_user_growth_series(db: AsyncSession, *, months: int = 6) -> list[MonthlyPoint]:
    rows = await stats_repo.new_users_by_month(db, months=months)
    return _zero_fill(rows, months)


async def get_recent_users(db: AsyncSession, *, limit: int = 5) -> list[AdminRecentUserItem]:
    rows = await stats_repo.recent_users_with_plan(db, limit=limit)
    return [
        AdminRecentUserItem(
            id=row.id,
            email=row.email,
            username=row.username,
            plan_tier=row.plan_tier or "free",
            status=row.status,
            mrr_vnd=int(row.mrr_vnd or 0),
            created_at=row.created_at,
        )
        for row in rows
    ]


# --- Plans management ---

_ALLOWED_EXPORT_FORMATS = {"glb", "obj", "zip"}
_ALLOWED_BAKE_PRIORITIES = {"low", "normal", "high"}


async def list_plans_admin(db: AsyncSession) -> list[Plan]:
    return await plan_repo.list_all(db)


async def update_plan(db: AsyncSession, actor, plan_id: uuid.UUID, changes: dict) -> Plan:
    plan = await plan_repo.get_by_id(db, plan_id)
    if not plan:
        raise SubPlanNotFound()

    if "bake_priority" in changes and changes["bake_priority"] not in _ALLOWED_BAKE_PRIORITIES:
        raise PlanUpdateInvalid("bake_priority phải là low/normal/high")
    if "allowed_export_formats" in changes:
        formats = set(changes["allowed_export_formats"] or [])
        if not formats or not formats <= _ALLOWED_EXPORT_FORMATS:
            raise PlanUpdateInvalid("allowed_export_formats chỉ được chứa glb/obj/zip")

    before = {field: getattr(plan, field) for field in changes}
    try:
        await plan_repo.update_fields(db, plan, changes)
    except IntegrityError as exc:
        await db.rollback()
        raise PlanUpdateInvalid("polar_product_id đã được gán cho gói khác") from exc

    await record_audit(
        db, actor, "plan.update", target_type="plan", target_id=plan_id,
        payload={"before": _jsonable(before), "after": _jsonable(changes)},
    )
    await db.commit()
    return plan


def _jsonable(data: dict) -> dict:
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in data.items()}


# --- User management ---


async def list_users(
    db: AsyncSession,
    *,
    q: str | None = None,
    status: str | None = None,
    role: str | None = None,
    include_deleted: bool = False,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[User]:
    return await user_repo.list_admin(
        db, q=q, status=status, role=role,
        include_deleted=include_deleted, limit=limit, before=before, before_id=before_id,
    )


async def get_user_detail(db: AsyncSession, user_id: uuid.UUID) -> AdminUserDetailResponse:
    user = await user_repo.get_by_id_any(db, user_id)
    if not user:
        raise AdminUserNotFound()
    subscription = await subscription_repo.get_by_user(db, user_id)
    usage = await monthly_usage_repo.get_or_create_current_month(db, user_id)
    total_projects = await project_repo.count_for_user(db, user_id)
    return AdminUserDetailResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        account_code=user.account_code,
        role=user.role,
        status=user.status,
        is_verified=user.is_verified,
        deleted_at=user.deleted_at,
        created_at=user.created_at,
        first_name=user.first_name,
        last_name=user.last_name,
        subscription_tier=subscription.tier if subscription else None,
        subscription_status=subscription.status if subscription else None,
        subscription_expires_at=subscription.expires_at if subscription else None,
        projects_count_this_month=usage.projects_count,
        exports_count_this_month=usage.exports_count,
        total_projects=total_projects,
    )


def _require_bannable_target(actor, target: User) -> None:
    if target.role != "user" or target.id == actor.id:
        raise AdminCannotModifyPrivileged()


async def ban_user(db: AsyncSession, actor, user_id: uuid.UUID, *, reason: str | None) -> None:
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise AdminUserNotFound()
    _require_bannable_target(actor, user)
    await user_repo.set_status(db, user, "suspended")
    await record_audit(
        db, actor, "user.ban", target_type="user", target_id=user_id,
        payload={"reason": reason} if reason else None,
    )
    await db.commit()


async def unban_user(db: AsyncSession, actor, user_id: uuid.UUID) -> None:
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise AdminUserNotFound()
    _require_bannable_target(actor, user)
    await user_repo.set_status(db, user, "active")
    await record_audit(db, actor, "user.unban", target_type="user", target_id=user_id)
    await db.commit()


async def create_staff(
    db: AsyncSession,
    actor,
    *,
    email: str,
    username: str,
    password: str,
    first_name: str,
    last_name: str,
) -> User:
    if await user_repo.get_by_email_any(db, email):
        raise EmailAlreadyTaken()
    if await user_repo.get_by_username_any(db, username):
        raise UsernameAlreadyTaken()
    staff = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        role="staff",
    )
    staff.is_verified = True
    await record_audit(
        db, actor, "staff.create", target_type="user", target_id=staff.id,
        payload={"email": email, "username": username},
    )
    await db.commit()
    return staff


# --- Projects / exports oversight ---


async def list_projects_admin(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    include_deleted: bool = False,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[AdminProjectListItem]:
    rows = await project_repo.list_admin(
        db, user_id=user_id, status=status, q=q,
        include_deleted=include_deleted, limit=limit, before=before, before_id=before_id,
    )
    return [
        AdminProjectListItem(
            id=project.id,
            name=project.name,
            status=project.status,
            user_id=project.user_id,
            owner_email=owner_email,
            deleted_at=project.deleted_at,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
        for project, owner_email in rows
    ]


async def get_project_admin(db: AsyncSession, project_id: uuid.UUID) -> AdminProjectDetailResponse:
    project = await project_repo.get_by_id_any(db, project_id)
    if not project:
        raise ProjectNotFound()
    owner = await user_repo.get_by_id_any(db, project.user_id)
    assets = await project_asset_repo.list_for_project(db, project_id)
    latest_bake = await bake_job_repo.get_latest_for_project(db, project_id)
    return AdminProjectDetailResponse(
        id=project.id,
        name=project.name,
        status=project.status,
        user_id=project.user_id,
        deleted_at=project.deleted_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
        description=project.description,
        owner_email=owner.email if owner else "",
        asset_count=len(assets),
        latest_bake_status=latest_bake.status if latest_bake else None,
    )


async def delete_project_admin(db: AsyncSession, actor, project_id: uuid.UUID) -> None:
    project = await project_repo.get_by_id(db, project_id)
    if not project:
        raise ProjectNotFound()
    await project_repo.soft_delete(db, project)
    await record_audit(db, actor, "project.delete", target_type="project", target_id=project_id)
    await db.commit()
    task_queue.enqueue_project_cleanup(str(project_id), countdown=7 * 24 * 3600)


async def list_exports_admin(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    format: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[AdminExportRecordResponse]:
    rows = await export_record_repo.list_admin(
        db, user_id=user_id, project_id=project_id, format=format, limit=limit, before=before, before_id=before_id
    )
    return [
        AdminExportRecordResponse(
            id=record.id,
            project_id=record.project_id,
            project_name=project_name,
            user_id=record.user_id,
            user_email=user_email,
            format=record.format,
            file_path=record.file_path,
            created_at=record.created_at,
        )
        for record, project_name, user_email in rows
    ]


# --- Bake jobs oversight ---


async def list_bake_jobs(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    project_id: uuid.UUID | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[AdminBakeJobResponse]:
    rows = await bake_job_repo.list_admin(
        db, status=status, priority=priority, project_id=project_id, limit=limit, before=before, before_id=before_id
    )
    return [
        AdminBakeJobResponse(
            id=job.id,
            project_id=job.project_id,
            project_name=project_name,
            status=job.status,
            priority=job.priority,
            error_message=job.error_message,
            worker_id=job.worker_id,
            queued_at=job.queued_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
        )
        for job, project_name in rows
    ]


async def get_bake_job(db: AsyncSession, job_id: uuid.UUID) -> AdminBakeJobDetailResponse:
    row = await bake_job_repo.get_admin_by_id(db, job_id)
    if not row:
        raise BakeJobNotFound()
    job, project_name = row
    return AdminBakeJobDetailResponse(
        id=job.id,
        project_id=job.project_id,
        project_name=project_name,
        status=job.status,
        priority=job.priority,
        error_message=job.error_message,
        worker_id=job.worker_id,
        queued_at=job.queued_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        design_config_snapshot=job.design_config_snapshot,
    )


async def requeue_bake_job(db: AsyncSession, actor, job_id: uuid.UUID) -> None:
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job:
        raise BakeJobNotFound()
    if job.status != "failed":
        raise BakeJobNotRequeueable()
    active = await bake_job_repo.get_active_for_project(db, job.project_id)
    if active:
        raise ProjectBakeInProgress()
    await bake_job_repo.mark_requeued(db, job)
    await record_audit(db, actor, "bake_job.requeue", target_type="bake_job", target_id=job_id)
    await db.commit()
    task_queue.enqueue_bake(str(job.id), job.priority)


async def cancel_bake_job(db: AsyncSession, actor, job_id: uuid.UUID) -> None:
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job:
        raise BakeJobNotFound()
    if job.status != "queued":
        raise BakeJobNotCancellable()
    await bake_job_repo.mark_cancelled(db, job)
    await record_audit(db, actor, "bake_job.cancel", target_type="bake_job", target_id=job_id)
    await db.commit()


# --- System health ---


async def get_system_health(db: AsyncSession, redis) -> SystemHealthResponse:
    checks: dict = {}
    try:
        await stats_repo.db_ping(db)
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"error: {exc}"

    queue_depths: dict = {}
    try:
        await redis.ping()
        checks["redis"] = "ok"
        for queue in ("high", "normal", "low"):
            queue_depths[queue] = await redis.llen(queue)
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    try:
        storage.health_check()
        checks["storage"] = "ok"
    except Exception as exc:
        checks["storage"] = f"error: {exc}"

    bake_counts: dict = {}
    if checks["db"] == "ok":
        bake_counts = await stats_repo.count_bake_jobs_by_status(db)

    all_ok = all(value == "ok" for value in checks.values())
    return SystemHealthResponse(
        status="ok" if all_ok else "degraded",
        checks=checks,
        queue_depths=queue_depths,
        bake_jobs_by_status=bake_counts,
    )


async def list_audit_logs(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    q: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[AuditLogResponse]:
    rows = await audit_log_repo.list_all(
        db,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        q=q,
        limit=limit,
        before=before, before_id=before_id,
    )
    return [
        AuditLogResponse(
            id=log.id,
            actor_id=log.actor_id,
            actor_email=actor_email,
            actor_role=log.actor_role,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            payload=log.payload,
            created_at=log.created_at,
        )
        for log, actor_email in rows
    ]
