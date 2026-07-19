import asyncio
import pathlib
import re
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_editor_session
from app.exceptions import AppException, AssetNotFound, StorageFileNotFound
from app.infrastructure import storage
from app.repositories import project_asset_repo
from app.schemas.auth import EditorSessionResponse
from app.schemas.editor import (
    EditorContextResponse,
    EditorDesignResponse,
    EditorDesignSaveRequest,
    EditorExportPackageResponse,
    EditorJobResponse,
    EditorUserResponse,
)
from app.schemas.project_asset import (
    AssetConfirmRequest,
    AssetResponse,
    AssetUploadURLRequest,
    AssetUploadURLResponse,
)
from app.services import asset_service, editor_service

router = APIRouter()
EDITOR_UPLOAD_ASSET_TYPES = {"sticker", "texture", "reference_image"}


@router.get("/me", response_model=EditorUserResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.get_me(db, session)


@router.get("/projects/{project_id}/context", response_model=EditorContextResponse)
async def get_project_context(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.get_context(db, session, project_id)


@router.post("/projects/{project_id}/designs", response_model=EditorDesignResponse)
async def save_project_design(
    project_id: uuid.UUID,
    body: EditorDesignSaveRequest,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.save_design(db, session, project_id, body)


@router.get("/designs/{design_id}", response_model=EditorDesignResponse)
async def get_design(
    design_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.get_design(db, session, design_id)


@router.post("/designs/{design_id}/bake", response_model=EditorJobResponse, status_code=202)
async def bake_design(
    design_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.trigger_bake(db, session, design_id)


@router.get("/jobs/{job_id}", response_model=EditorJobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.get_job(db, session, job_id)


@router.post(
    "/designs/{design_id}/export",
    response_model=EditorExportPackageResponse,
)
async def export_design(
    design_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    return await editor_service.get_export_package(db, session, design_id)


@router.post("/assets/upload-url", response_model=AssetUploadURLResponse)
async def create_asset_upload_url(
    body: AssetUploadURLRequest,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    if body.asset_type not in EDITOR_UPLOAD_ASSET_TYPES:
        raise AppException(
            403,
            "EDITOR_ASSET_TYPE_FORBIDDEN",
            "KusStudio cannot replace the canonical source model.",
        )
    user = await editor_service.get_editor_user(db, session)
    await editor_service.require_editor_project(db, session)
    return await asset_service.create_upload_url(db, user, session.project_id, body)


@router.post("/assets/confirm", response_model=AssetResponse)
async def confirm_asset_upload(
    body: AssetConfirmRequest,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    asset = await project_asset_repo.get_by_id(db, body.asset_id)
    if (
        not asset
        or asset.project_id != session.project_id
        or asset.user_id != session.user_id
        or asset.asset_type not in EDITOR_UPLOAD_ASSET_TYPES
    ):
        raise AssetNotFound()
    user = await editor_service.get_editor_user(db, session)
    return await asset_service.confirm_upload(db, user, session.project_id, body)


@router.get("/assets/{asset_id}/content")
async def get_asset_content(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    asset = await editor_service.get_asset_for_session(db, session, asset_id)
    filename = asset.original_filename or f"{asset.id}{pathlib.Path(asset.file_path).suffix}"
    return await _stream_object(asset.file_path, filename, disposition="inline")


@router.get("/exports/{export_id}/content")
async def get_export_content(
    export_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session: EditorSessionResponse = Depends(get_editor_session),
):
    record = await editor_service.get_export_for_session(db, session, export_id)
    suffix = pathlib.Path(record.file_path).suffix or f".{record.format}"
    return await _stream_object(
        record.file_path,
        f"kusshoes-{record.project_id}-{record.id}{suffix}",
        disposition="attachment",
    )


async def _stream_object(
    file_path: str,
    filename: str,
    *,
    disposition: str,
) -> StreamingResponse:
    try:
        download = await asyncio.to_thread(storage.open_object_download, file_path)
    except storage.ObjectNotFoundError:
        raise StorageFileNotFound()
    safe_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._")[:180]
    safe_filename = safe_filename or "kusshoes-download"
    headers = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": f'{disposition}; filename="{safe_filename}"',
        "Content-Length": str(download.size_bytes),
        "X-Content-Type-Options": "nosniff",
    }
    if download.etag:
        headers["ETag"] = f'"{download.etag}"'
    return StreamingResponse(
        storage.iter_object_chunks(download),
        media_type=download.content_type,
        headers=headers,
    )
