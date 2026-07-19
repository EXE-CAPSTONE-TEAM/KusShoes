import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AppException, AssetNotFound, ProjectNotFound
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    project_asset_repo,
    project_repo,
    user_repo,
)
from app.schemas.auth import EditorSessionResponse
from app.schemas.editor import (
    EditorContextResponse,
    EditorDesignResponse,
    EditorDesignSaveRequest,
    EditorExportPackageResponse,
    EditorJobResponse,
    EditorModelAssetResponse,
    EditorPermissionsResponse,
    EditorProjectResponse,
    EditorUserResponse,
)
from app.schemas.project import TriggerBakeRequest
from app.services import project_service


async def get_editor_user(db: AsyncSession, session: EditorSessionResponse):
    user = await user_repo.get_by_id(db, session.user_id)
    if not user or not user.is_active:
        raise ProjectNotFound()
    return user


async def require_editor_project(
    db: AsyncSession,
    session: EditorSessionResponse,
    requested_project_id: uuid.UUID | None = None,
    *,
    for_update: bool = False,
):
    if requested_project_id is not None and requested_project_id != session.project_id:
        raise ProjectNotFound()
    project = await project_repo.get_owned_by_id(
        db, session.project_id, session.user_id, for_update=for_update
    )
    if not project:
        raise ProjectNotFound()
    return project


async def get_me(db: AsyncSession, session: EditorSessionResponse) -> EditorUserResponse:
    user = await get_editor_user(db, session)
    return EditorUserResponse(
        id=user.id,
        role=user.role,
        name=user.full_name.strip() or user.username,
        email=user.email,
        createdAt=user.created_at,
        updatedAt=user.updated_at,
    )


async def get_context(
    db: AsyncSession,
    session: EditorSessionResponse,
    project_id: uuid.UUID,
) -> EditorContextResponse:
    project = await require_editor_project(db, session, project_id)
    asset = await _canonical_asset(db, project)
    latest_job = await bake_job_repo.get_latest_for_project(db, project.id)
    exports = await export_record_repo.list_for_project(db, project.id)
    return EditorContextResponse(
        project=_project_response(project, asset),
        modelAsset=_model_asset_response(project, asset) if asset else None,
        latestDesign=(
            _design_response(project, asset, latest_job, exports)
            if project.design_config and asset
            else None
        ),
        permissions=_permissions(session),
    )


async def save_design(
    db: AsyncSession,
    session: EditorSessionResponse,
    project_id: uuid.UUID,
    body: EditorDesignSaveRequest,
) -> EditorDesignResponse:
    _require_scope(session, "editor:write")
    project = await require_editor_project(db, session, project_id, for_update=True)
    asset = await _canonical_asset(db, project)
    if not asset or asset.status != "ready":
        raise AppException(409, "EDITOR_MODEL_NOT_READY", "Project model is not ready.")
    if body.design_config.model_asset_id != asset.id:
        raise AppException(
            409,
            "EDITOR_MODEL_MISMATCH",
            "Design config does not target the canonical project model.",
        )

    design_config = body.design_config.model_dump(mode="json", by_alias=True)
    metadata = dict(design_config.get("metadata") or {})
    if body.name:
        metadata["designName"] = body.name.strip()
    design_config["metadata"] = metadata
    await project_repo.save_design(
        db,
        project,
        design_config=design_config,
        thumbnail_path=project.thumbnail_path,
        base_revision=body.base_revision,
        author_user_id=session.user_id,
        client="editor",
    )
    return _design_response(project, asset, None, [])


async def get_design(
    db: AsyncSession,
    session: EditorSessionResponse,
    design_id: uuid.UUID,
) -> EditorDesignResponse:
    project = await require_editor_project(db, session, design_id)
    asset = await _canonical_asset(db, project)
    if not project.design_config or not asset:
        raise AppException(404, "EDITOR_DESIGN_NOT_FOUND", "Design not found.")
    latest_job = await bake_job_repo.get_latest_for_project(db, project.id)
    exports = await export_record_repo.list_for_project(db, project.id)
    return _design_response(project, asset, latest_job, exports)


async def trigger_bake(
    db: AsyncSession,
    session: EditorSessionResponse,
    design_id: uuid.UUID,
) -> EditorJobResponse:
    _require_scope(session, "editor:write")
    project = await require_editor_project(db, session, design_id)
    asset = await _canonical_asset(db, project)
    if not asset or asset.status != "ready":
        raise AppException(409, "EDITOR_MODEL_NOT_READY", "Project model is not ready.")
    if not project.design_config:
        raise AppException(409, "EDITOR_DESIGN_NOT_SAVED", "Save the design before baking.")
    result = await project_service.trigger_bake(
        db,
        project.id,
        TriggerBakeRequest(design_config=project.design_config),
    )
    job = await bake_job_repo.get_by_id(db, result.job_id)
    if not job:
        raise AppException(500, "EDITOR_JOB_NOT_CREATED", "Bake job could not be created.")
    return _job_response(job)


async def get_job(
    db: AsyncSession,
    session: EditorSessionResponse,
    job_id: uuid.UUID,
) -> EditorJobResponse:
    await require_editor_project(db, session)
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.project_id != session.project_id:
        raise AppException(404, "EDITOR_JOB_NOT_FOUND", "Bake job not found.")
    return _job_response(job)


async def get_export_package(
    db: AsyncSession,
    session: EditorSessionResponse,
    design_id: uuid.UUID,
) -> EditorExportPackageResponse:
    project = await require_editor_project(db, session, design_id)
    latest_job = await bake_job_repo.get_latest_for_project(db, project.id)
    if (
        not latest_job
        or latest_job.status != "completed"
        or latest_job.design_config_snapshot != project.design_config
    ):
        raise AppException(
            409,
            "EDITOR_EXPORT_NOT_READY",
            "Bake the current design before exporting.",
        )
    records = [
        record
        for record in await export_record_repo.list_for_project(db, project.id)
        if record.bake_job_id == latest_job.id
    ]
    if not records:
        raise AppException(409, "EDITOR_EXPORT_NOT_READY", "Export output is not ready.")
    preferred = next((record for record in records if record.format == "zip"), None)
    preferred = preferred or next((record for record in records if record.format == "glb"), None)
    preferred = preferred or records[0]
    download_url = f"/api/v1/editor/exports/{preferred.id}/content"
    return EditorExportPackageResponse(
        id=preferred.id,
        designId=project.id,
        downloadUrl=download_url,
        zipUrl=download_url if preferred.format == "zip" else None,
        files=[record.format for record in records],
        createdAt=preferred.created_at,
        updatedAt=latest_job.completed_at,
    )


async def get_asset_for_session(
    db: AsyncSession,
    session: EditorSessionResponse,
    asset_id: uuid.UUID,
):
    await require_editor_project(db, session)
    asset = await project_asset_repo.get_by_id(db, asset_id)
    if (
        not asset
        or asset.project_id != session.project_id
        or asset.user_id != session.user_id
        or asset.status != "ready"
    ):
        raise AssetNotFound()
    return asset


async def get_export_for_session(
    db: AsyncSession,
    session: EditorSessionResponse,
    export_id: uuid.UUID,
):
    await require_editor_project(db, session)
    record = await export_record_repo.get_for_user(db, export_id, session.user_id)
    if not record or record.project_id != session.project_id:
        raise AppException(404, "EDITOR_EXPORT_NOT_FOUND", "Export not found.")
    await export_record_repo.increment_download_count(db, record)
    return record


async def _canonical_asset(db: AsyncSession, project):
    if not project.canonical_model_asset_id:
        return None
    asset = await project_asset_repo.get_by_id(db, project.canonical_model_asset_id)
    if not asset or asset.project_id != project.id or asset.user_id != project.user_id:
        return None
    return asset


def _project_response(project, asset) -> EditorProjectResponse:
    source_type = _source_type(asset)
    status = {
        "draft": "draft",
        "baking": "processing",
        "completed": "ready",
        "failed": "failed",
    }.get(project.status, "ready" if asset and asset.status == "ready" else "processing")
    return EditorProjectResponse(
        id=project.id,
        name=project.name,
        status=status,
        thumbnailUrl=None,
        sourceType=source_type,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
    )


def _model_asset_response(project, asset) -> EditorModelAssetResponse:
    asset_status = asset.status if asset.status in {"processing", "ready", "failed"} else "uploaded"
    asset_url = f"/api/v1/editor/assets/{asset.id}/content"
    quality_report = dict(asset.metadata_ or {})
    if asset.mime_type != "model/gltf-binary":
        asset_status = "failed"
        quality_report["error"] = "KusStudio currently requires a canonical GLB model."
    return EditorModelAssetResponse(
        id=asset.id,
        scanSessionId=asset.id,
        projectId=project.id,
        status=asset_status,
        sourceType=_source_type(asset),
        glbUrl=asset_url,
        canonicalGlbUrl=asset_url,
        qualityReport=quality_report,
        createdAt=asset.created_at,
    )


def _design_response(project, asset, latest_job, exports: list) -> EditorDesignResponse:
    design_config = dict(project.design_config or {})
    metadata = design_config.get("metadata")
    design_name = (
        str(metadata.get("designName")).strip()
        if isinstance(metadata, dict) and metadata.get("designName")
        else project.name
    )
    matching_job = bool(latest_job and latest_job.design_config_snapshot == design_config)
    preview_export = next(
        (
            record
            for record in exports
            if matching_job
            and latest_job.status == "completed"
            and record.bake_job_id == latest_job.id
            and record.format == "glb"
        ),
        None,
    )
    preview_status = "ready" if preview_export else "none"
    preview_error = None
    if matching_job and latest_job.status == "processing":
        preview_status = "processing"
    elif matching_job and latest_job.status == "queued":
        preview_status = "pending"
    elif matching_job and latest_job.status in {"failed", "cancelled"}:
        preview_status = "failed"
        preview_error = latest_job.error_message or "Preview bake failed."
    return EditorDesignResponse(
        id=project.id,
        userId=project.user_id,
        projectId=project.id,
        modelAssetId=asset.id,
        name=design_name,
        status="draft",
        revision=project.current_design_revision,
        designConfig=design_config,
        previewGlbUrl=(
            f"/api/v1/editor/exports/{preview_export.id}/content" if preview_export else None
        ),
        previewStatus=preview_status,
        previewErrorMessage=preview_error,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
    )


def _job_response(job) -> EditorJobResponse:
    status = (
        job.status if job.status in {"queued", "processing", "completed", "failed"} else "failed"
    )
    progress = {"queued": 0, "processing": 50}.get(status, 100)
    updated_at: datetime = job.completed_at or job.started_at or job.queued_at
    return EditorJobResponse(
        id=job.id,
        status=status,
        progress=progress,
        errorMessage=job.error_message,
        designId=job.project_id,
        projectId=job.project_id,
        createdAt=job.queued_at,
        updatedAt=updated_at,
    )


def _permissions(session: EditorSessionResponse) -> EditorPermissionsResponse:
    can_write = "editor:write" in session.scopes
    return EditorPermissionsResponse(
        canEdit=can_write,
        canBake=can_write,
        canExport="editor:read" in session.scopes,
    )


def _source_type(asset) -> str:
    metadata: dict[str, Any] = dict(asset.metadata_ or {}) if asset else {}
    source_type = metadata.get("source_type")
    if source_type in {"scan", "uploaded_glb", "uploaded_obj", "template"}:
        return str(source_type)
    return "uploaded_glb"


def _require_scope(session: EditorSessionResponse, scope: str) -> None:
    if scope not in session.scopes:
        raise AppException(403, "EDITOR_SCOPE_FORBIDDEN", "Editor permission denied.")
