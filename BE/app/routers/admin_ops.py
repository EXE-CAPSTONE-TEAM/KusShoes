from app.utils.pagination import decode_cursor, encode_cursor
import uuid
from datetime import datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write, get_redis
from app.schemas.admin import (
    CursorPage,
    AdminBakeJobDetailResponse,
    AdminBakeJobResponse,
    AdminExportRecordResponse,
    AdminProjectDetailResponse,
    AdminProjectListItem,
    AdminSearchQuery,
    AuditLogResponse,
    BakePriority,
    BakeStatus,
    ExportFormat,
    ProjectStatus,
    SystemHealthResponse,
)
from app.services import admin_service

router = APIRouter()


# --- Projects oversight ---


@router.get("/projects", response_model=CursorPage[AdminProjectListItem])
async def list_projects(
    user_id: uuid.UUID | None = None,
    status: ProjectStatus | None = None,
    q: AdminSearchQuery | None = None,
    include_deleted: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_projects_admin(
        db, user_id=user_id, status=status, q=q,
        include_deleted=include_deleted, limit=limit, before=before, before_id=before_id,
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)


@router.get("/projects/{project_id}", response_model=AdminProjectDetailResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_project_admin(db, project_id)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.delete_project_admin(db, admin, project_id)
    return {"status": "deleted"}


# --- Bake jobs oversight ---


@router.get("/bake-jobs", response_model=CursorPage[AdminBakeJobResponse])
async def list_bake_jobs(
    status: BakeStatus | None = None,
    priority: BakePriority | None = None,
    project_id: uuid.UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_bake_jobs(
        db, status=status, priority=priority, project_id=project_id, limit=limit, before=before, before_id=before_id
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.queued_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)


@router.get("/bake-jobs/{job_id}", response_model=AdminBakeJobDetailResponse)
async def get_bake_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_bake_job(db, job_id)


@router.post("/bake-jobs/{job_id}/requeue")
async def requeue_bake_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.requeue_bake_job(db, admin, job_id)
    return {"status": "requeued"}


@router.post("/bake-jobs/{job_id}/cancel")
async def cancel_bake_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.cancel_bake_job(db, admin, job_id)
    return {"status": "cancelled"}


# --- Exports oversight ---


@router.get("/exports", response_model=CursorPage[AdminExportRecordResponse])
async def list_exports(
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    format: ExportFormat | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_exports_admin(
        db, user_id=user_id, project_id=project_id, format=format, limit=limit, before=before, before_id=before_id
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)


# --- System health ---


@router.get("/system/health", response_model=SystemHealthResponse)
async def system_health(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_system_health(db, redis)


# --- Audit logs (admin-only) ---


@router.get("/audit-logs", response_model=CursorPage[AuditLogResponse])
async def list_audit_logs(
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    q: AdminSearchQuery | None = None,
    before: datetime | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_audit_logs(
        db,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        q=q,
        limit=limit,
        before=before,
        before_id=before_id,
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)
