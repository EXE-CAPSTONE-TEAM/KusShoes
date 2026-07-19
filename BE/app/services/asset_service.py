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
    "sticker": {"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}, "image/webp": {".webp"}},
    "texture": {"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}, "image/webp": {".webp"}},
    "reference_image": {
        "image/jpeg": {".jpg", ".jpeg"},
        "image/png": {".png"},
        "image/webp": {".webp"},
    },
}

MAX_UPLOAD_BYTES = {
    "source_model": 500 * 1024 * 1024,
    "sticker": 5 * 1024 * 1024,
    "texture": 25 * 1024 * 1024,
    "reference_image": 25 * 1024 * 1024,
}


def validate_uploaded_object(
    *,
    asset_type: str,
    expected_content_type: str,
    metadata: storage.ObjectMetadata,
    prefix: bytes,
    reported_size_bytes: int | None,
) -> int:
    max_size = MAX_UPLOAD_BYTES[asset_type]
    if metadata.size_bytes < 1 or metadata.size_bytes > max_size:
        raise AssetUploadInvalid(
            f"Kích thước file không hợp lệ; giới hạn cho {asset_type} là {max_size} bytes"
        )

    actual_content_type = metadata.content_type.split(";", 1)[0].strip().lower()
    if actual_content_type != expected_content_type.lower():
        raise AssetUploadInvalid("MIME type trên storage không khớp với upload đã đăng ký")

    if reported_size_bytes is not None and reported_size_bytes != metadata.size_bytes:
        raise AssetUploadInvalid("Kích thước file tải lên không khớp với storage")

    if not _matches_file_signature(actual_content_type, prefix):
        raise AssetUploadInvalid("Nội dung file không khớp với định dạng đã đăng ký")

    return metadata.size_bytes


def _matches_file_signature(content_type: str, prefix: bytes) -> bool:
    if content_type == "model/gltf-binary":
        return prefix.startswith(b"glTF")
    if content_type == "model/gltf+json":
        return prefix.lstrip().startswith(b"{")
    if content_type == "image/png":
        return prefix.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return prefix.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(prefix) >= 12 and prefix.startswith(b"RIFF") and prefix[8:12] == b"WEBP"
    return False


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
    try:
        metadata, prefix = await asyncio.gather(
            asyncio.to_thread(storage.get_object_metadata, asset.file_path),
            asyncio.to_thread(storage.read_object_prefix, asset.file_path),
        )
    except storage.ObjectNotFoundError:
        raise StorageFileNotFound()

    verified_size = validate_uploaded_object(
        asset_type=asset.asset_type,
        expected_content_type=asset.mime_type or "application/octet-stream",
        metadata=metadata,
        prefix=prefix,
        reported_size_bytes=body.file_size_bytes,
    )
    await project_asset_repo.mark_ready(db, asset, file_size_bytes=verified_size)
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
