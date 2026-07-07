import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.project_asset import (
    AssetConfirmRequest,
    AssetListResponse,
    AssetResponse,
    AssetUploadURLRequest,
    AssetUploadURLResponse,
)
from app.schemas.user import MessageResponse
from app.services import asset_service

router = APIRouter()


@router.post("/{project_id}/assets/upload-url", response_model=AssetUploadURLResponse)
async def create_upload_url(
    project_id: uuid.UUID,
    body: AssetUploadURLRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await asset_service.create_upload_url(db, user, project_id, body)


@router.post("/{project_id}/assets/confirm", response_model=AssetResponse)
async def confirm_upload(
    project_id: uuid.UUID,
    body: AssetConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await asset_service.confirm_upload(db, user, project_id, body)


@router.get("/{project_id}/assets", response_model=AssetListResponse)
async def list_assets(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await asset_service.list_assets(db, user, project_id)


@router.delete("/{project_id}/assets/{asset_id}", response_model=MessageResponse)
async def delete_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await asset_service.delete_asset(db, user, project_id, asset_id)

# TODO: Phase 5 — implement Project Asset endpoints
# POST   /{id}/assets/upload-url
# POST   /{id}/assets/confirm
# GET    /{id}/assets
# DELETE /{id}/assets/{asset_id}
