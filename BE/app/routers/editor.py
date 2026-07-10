import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.editor import (
    EditorContextResponse,
    EditorDesignResponse,
    EditorSaveDesignRequest,
)
from app.services import editor_service

router = APIRouter()


@router.get("/projects/{project_id}/context", response_model=EditorContextResponse)
async def get_editor_context(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await editor_service.get_editor_context(db, user, project_id)


@router.put("/projects/{project_id}/design", response_model=EditorDesignResponse)
async def save_editor_design(
    project_id: uuid.UUID,
    body: EditorSaveDesignRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await editor_service.save_editor_design(db, user, project_id, body)


@router.get("/assets/{asset_id}/download")
async def download_editor_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    stream, media_type = await editor_service.open_asset_download(db, user, asset_id)
    return StreamingResponse(stream, media_type=media_type)
