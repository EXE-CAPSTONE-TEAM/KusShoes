import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.export import ExportDownloadResponse, ExportHistoryResponse
from app.services import export_service

router = APIRouter()


@router.get("/exports", response_model=ExportHistoryResponse)
async def list_export_history(
    project_id: uuid.UUID | None = None,
    format: Literal["glb", "obj", "zip"] | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await export_service.list_history(
        db,
        user,
        project_id=project_id,
        format=format,
        limit=limit,
        cursor=cursor,
    )


@router.post("/exports/{export_id}/download-url", response_model=ExportDownloadResponse)
async def create_export_download_url(
    export_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await export_service.create_download_url(db, user, export_id)
