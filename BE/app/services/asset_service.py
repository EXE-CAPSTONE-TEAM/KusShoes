import asyncio
import pathlib
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AssetNotFound, AssetUploadInvalid, StorageFileNotFound
from app.infrastructure import storage, task_queue
from app.repositories import project_asset_repo, project_repo
from app.schemas.project_asset import (
    AssetConfirmRequest,
    AssetListResponse,
    AssetResponse,
    AssetUploadURLRequest,
    AssetUploadURLResponse,
)
from app.services.project_service import require_owner

ALLOWED_UPLOADS = {
    "source_model": {"model/gltf-binary": {".glb"}, "model/gltf+json": {".gltf"}},
    "sticker": {"image/png": {".png"}, "image/webp": {".webp"}},
    "texture": {"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}, "image/webp": {".webp"}},
    "reference_image": {"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}, "image/webp": {".webp"}},
}


async def create_upload_url(
    db: AsyncSession, user, project_id: uuid.UUID, body: AssetUploadURLRequest
) -> AssetUploadURLResponse:
    await require_owner(db, project_id, user)
    extension = pathlib.Path(body.filename).suffix.lower()
    allowed_extensions = ALLOWED_UPLOADS[body.asset_type].get(body.content_type, set())
    if extension not in allowed_extensions:
        raise AssetUploadInvalid("Loại file hoặc MIME type không được hỗ trợ")
    file_path = f"{body.asset_type}s/{project_id}/{uuid.uuid4()}{extension}"
    asset = await project_asset_repo.create_upload(
        db,
        project_id=project_id,
        user_id=user.id,
        asset_type=body.asset_type,
        filename=body.filename,
        file_path=file_path,
        content_type=body.content_type,
    )
    return AssetUploadURLResponse(
        upload_url=storage.generate_presigned_upload_url(file_path, body.content_type),
        asset_id=asset.id,
        file_path=file_path,
    )


async def confirm_upload(
    db: AsyncSession, user, project_id: uuid.UUID, body: AssetConfirmRequest
) -> AssetResponse:
    project = await require_owner(db, project_id, user)
    asset = await project_asset_repo.get_by_id(db, body.asset_id)
    if not asset or asset.project_id != project_id or asset.user_id != user.id:
        raise AssetNotFound()
    if asset.status != "uploading":
        raise AssetUploadInvalid("Asset không ở trạng thái chờ upload")
    if not await asyncio.to_thread(storage.file_exists, asset.file_path):
        raise StorageFileNotFound()
    await project_asset_repo.mark_ready(db, asset, file_size_bytes=body.file_size_bytes)
    if asset.asset_type == "source_model":
        await project_repo.set_canonical_asset(db, project, asset.id)
    return AssetResponse.model_validate(asset)


async def list_assets(db: AsyncSession, user, project_id: uuid.UUID) -> AssetListResponse:
    await require_owner(db, project_id, user)
    assets = await project_asset_repo.list_for_project(db, project_id)
    return AssetListResponse(items=[AssetResponse.model_validate(asset) for asset in assets])


async def delete_asset(
    db: AsyncSession, user, project_id: uuid.UUID, asset_id: uuid.UUID
) -> dict[str, str]:
    project = await require_owner(db, project_id, user)
    asset = await project_asset_repo.get_by_id(db, asset_id)
    if not asset or asset.project_id != project_id:
        raise AssetNotFound()
    if project.canonical_model_asset_id == asset.id:
        await project_repo.set_canonical_asset(db, project, None)
    path = asset.file_path
    await project_asset_repo.delete(db, asset)
    await db.commit()
    task_queue.enqueue_storage_delete(path)
    return {"message": "Đã xóa asset"}
