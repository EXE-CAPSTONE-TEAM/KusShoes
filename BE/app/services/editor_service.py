import pathlib
import uuid
from copy import deepcopy

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AssetNotFound, ProjectAccessDenied, StorageFileNotFound
from app.infrastructure import storage
from app.repositories import project_asset_repo, project_repo
from app.schemas.editor import (
    EditorContextResponse,
    EditorDesignResponse,
    EditorModelAssetResponse,
    EditorPermissionsResponse,
    EditorProjectResponse,
    EditorSaveDesignRequest,
    EditorUserResponse,
)
from app.services.project_service import require_owner
from app.types import JsonObject


async def get_editor_context(
    db: AsyncSession,
    user,
    project_id: uuid.UUID,
) -> EditorContextResponse:
    project = await require_owner(db, project_id, user)
    model_asset = await _get_canonical_model_asset(db, project)
    return _to_context(user, project, model_asset)


async def save_editor_design(
    db: AsyncSession,
    user,
    project_id: uuid.UUID,
    body: EditorSaveDesignRequest,
) -> EditorDesignResponse:
    project = await require_owner(db, project_id, user)
    model_asset = await _get_canonical_model_asset(db, project)
    if not model_asset:
        raise AssetNotFound()
    design_config = _with_model_asset_id(body.designConfig, model_asset.id)
    await project_repo.save_design(
        db,
        project,
        design_config=design_config,
        thumbnail_path=project.thumbnail_path,
    )
    await db.commit()
    return _to_design(project, model_asset)


async def open_asset_download(db: AsyncSession, user, asset_id: uuid.UUID):
    asset = await project_asset_repo.get_by_id(db, asset_id)
    if not asset:
        raise AssetNotFound()
    project = await project_repo.get_by_id(db, asset.project_id)
    if not project:
        raise AssetNotFound()
    if project.user_id != user.id:
        raise ProjectAccessDenied()
    try:
        return storage.open_download_stream(asset.file_path)
    except FileNotFoundError:
        raise StorageFileNotFound()


async def _get_canonical_model_asset(db: AsyncSession, project):
    if project.canonical_model_asset_id:
        asset = await project_asset_repo.get_by_id(db, project.canonical_model_asset_id)
        if asset and asset.project_id == project.id:
            return asset
    assets = await project_asset_repo.list_for_project(db, project.id)
    return next((asset for asset in assets if asset.asset_type == "source_model"), None)


def _to_context(user, project, model_asset) -> EditorContextResponse:
    return EditorContextResponse(
        user=_to_user(user),
        project=_to_project(project),
        modelAsset=_to_model_asset(model_asset) if model_asset else None,
        latestDesign=_to_design(project, model_asset)
        if project.design_config and model_asset
        else None,
        permissions=EditorPermissionsResponse(
            canEdit=True,
            canBake=False,
            canExport=False,
        ),
    )


def _to_user(user) -> EditorUserResponse:
    return EditorUserResponse(
        id=user.id,
        role=user.role,
        name=user.full_name.strip() or user.username,
        email=user.email,
        createdAt=user.created_at,
        updatedAt=user.updated_at,
    )


def _to_project(project) -> EditorProjectResponse:
    return EditorProjectResponse(
        id=project.id,
        name=project.name,
        status=_project_status(project.status),
        thumbnailUrl=_download_url(project.thumbnail_path) if project.thumbnail_path else None,
        sourceType="uploaded_glb",
        createdAt=project.created_at,
        updatedAt=project.updated_at,
    )


def _to_model_asset(asset) -> EditorModelAssetResponse:
    download_url = f"/api/v1/editor/assets/{asset.id}/download"
    metadata = asset.metadata_ or {}
    return EditorModelAssetResponse(
        id=asset.id,
        scanSessionId=str(asset.id),
        projectId=asset.project_id,
        status=_asset_status(asset.status),
        sourceType=_source_type(asset.file_path),
        glbUrl=download_url,
        canonicalGlbUrl=download_url,
        textureUrls=_string_list(metadata.get("texture_urls")),
        qualityReport=metadata.get("quality_report") if isinstance(metadata.get("quality_report"), dict) else metadata,
        createdAt=asset.created_at,
        updatedAt=None,
    )


def _to_design(project, model_asset) -> EditorDesignResponse | None:
    if not project.design_config or not model_asset:
        return None
    design_config = _with_model_asset_id(project.design_config, model_asset.id)
    return EditorDesignResponse(
        id=str(project.id),
        userId=project.user_id,
        projectId=project.id,
        modelAssetId=model_asset.id,
        name=project.name,
        status="draft",
        designConfig=design_config,
        previewGlbUrl=None,
        previewStatus="none",
        previewErrorMessage=None,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
    )


def _with_model_asset_id(
    design_config: JsonObject,
    model_asset_id: uuid.UUID | None,
) -> JsonObject:
    config = deepcopy(design_config)
    if model_asset_id:
        config["modelAssetId"] = str(model_asset_id)
    return config


def _download_url(file_path: str) -> str:
    return storage.generate_presigned_download_url(file_path, ttl=3600)


def _project_status(status: str) -> str:
    normalized = status.lower()
    if normalized in {"completed", "ready", "exported"}:
        return "ready"
    if normalized in {"failed", "archived"}:
        return normalized
    if normalized in {"processing", "in_progress", "queued", "baking"}:
        return "processing"
    return "draft"


def _asset_status(status: str) -> str:
    normalized = status.lower()
    if normalized == "ready":
        return "ready"
    if normalized == "failed":
        return "failed"
    if normalized == "uploading":
        return "uploaded"
    return "processing"


def _source_type(file_path: str) -> str:
    suffix = pathlib.Path(file_path).suffix.lower()
    if suffix == ".obj":
        return "uploaded_obj"
    return "uploaded_glb"


def _string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]
