import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, verify_service_token
from app.schemas.project import (
    BakeJobResponse,
    BakeJobStatusResponse,
    CreateProjectRequest,
    ExportListResponse,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectResponse,
    ProjectTrashListResponse,
    SaveDesignRequest,
    TriggerBakeRequest,
    UpdateProjectRequest,
)
from app.schemas.user import MessageResponse
from app.services import project_service

router = APIRouter()


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.list_projects(db, user, limit=limit, cursor=cursor)


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: CreateProjectRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.create_project(db, user, body)


@router.get("/trash", response_model=ProjectTrashListResponse)
async def list_trash(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.list_trash(db, user, limit=limit, cursor=cursor)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.get_project(db, user, project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: UpdateProjectRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.update_project(db, user, project_id, body)


@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.delete_project(db, user, project_id)


@router.post("/{project_id}/restore", response_model=ProjectResponse)
async def restore_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.restore_project(db, user, project_id)


@router.delete("/{project_id}/permanent", response_model=MessageResponse)
async def permanently_delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.permanently_delete_project(db, user, project_id)


@router.put("/{project_id}/design", response_model=MessageResponse)
async def save_design(
    project_id: uuid.UUID,
    body: SaveDesignRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_service_token),
):
    return await project_service.save_design(db, project_id, body)


@router.post("/{project_id}/bake", response_model=BakeJobResponse, status_code=202)
async def trigger_bake(
    project_id: uuid.UUID,
    body: TriggerBakeRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_service_token),
):
    return await project_service.trigger_bake(db, project_id, body)


@router.get("/{project_id}/bake/{job_id}", response_model=BakeJobStatusResponse)
async def get_bake_status(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.get_bake_status(db, user, project_id, job_id)


@router.post(
    "/{project_id}/bake/{job_id}/retry",
    response_model=BakeJobResponse,
    status_code=202,
)
async def retry_bake(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.retry_bake(db, user, project_id, job_id)


@router.post("/{project_id}/bake/{job_id}/cancel", response_model=BakeJobResponse)
async def cancel_bake(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.cancel_bake(db, user, project_id, job_id)


@router.get("/{project_id}/exports", response_model=ExportListResponse)
async def list_exports(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await project_service.list_exports(db, user, project_id)
