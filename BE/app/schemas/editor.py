import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_EDITOR_CONFIG_BYTES = 2 * 1024 * 1024
MAX_EDITOR_LAYERS = 50


class EditorSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class EditorUserResponse(EditorSchema):
    id: uuid.UUID
    role: str
    name: str
    email: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class EditorProjectResponse(EditorSchema):
    id: uuid.UUID
    name: str
    status: Literal["draft", "processing", "ready", "failed", "archived"]
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    source_type: Literal["scan", "uploaded_glb", "uploaded_obj", "template"] = Field(
        alias="sourceType"
    )
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class EditorModelAssetResponse(EditorSchema):
    id: uuid.UUID
    scan_session_id: uuid.UUID = Field(alias="scanSessionId")
    project_id: uuid.UUID = Field(alias="projectId")
    # raw = scan output awaiting desktop crop/cleanup (spec §B.2)
    status: Literal["uploaded", "processing", "ready", "raw", "failed"]
    source_type: Literal["scan", "uploaded_glb", "uploaded_obj", "template"] = Field(
        alias="sourceType"
    )
    glb_url: str = Field(alias="glbUrl")
    canonical_glb_url: str = Field(alias="canonicalGlbUrl")
    obj_url: str = Field(default="", alias="objUrl")
    mtl_url: str = Field(default="", alias="mtlUrl")
    texture_url: str = Field(default="", alias="textureUrl")
    texture_urls: list[str] = Field(default_factory=list, alias="textureUrls")
    metadata_url: str = Field(default="", alias="metadataUrl")
    quality_report_url: str = Field(default="", alias="qualityReportUrl")
    obj_package_zip_url: str = Field(default="", alias="objPackageZipUrl")
    quality_report: dict[str, Any] = Field(default_factory=dict, alias="qualityReport")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class EditorMaterialConfig(EditorSchema):
    roughness: float = Field(default=1.0, ge=0.0, le=1.0)
    metallic: float = Field(default=0.0, ge=0.0, le=1.0)


class EditorDesignConfig(EditorSchema):
    model_asset_id: uuid.UUID = Field(alias="modelAssetId")
    base_color: str = Field(default="#ffffff", alias="baseColor", pattern=r"^#[0-9A-Fa-f]{6}$")
    material: EditorMaterialConfig = Field(default_factory=EditorMaterialConfig)
    stickers: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EDITOR_LAYERS)
    texts: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EDITOR_LAYERS)
    camera: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_serialized_size(self) -> "EditorDesignConfig":
        payload = json.dumps(
            self.model_dump(mode="json", by_alias=True),
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        if len(payload) > MAX_EDITOR_CONFIG_BYTES:
            raise ValueError("Editor design config exceeds the 2 MiB limit")
        return self


class EditorDesignSaveRequest(EditorSchema):
    design_config: EditorDesignConfig = Field(alias="designConfig")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    base_revision: int = Field(alias="baseRevision", ge=0)


class EditorDesignResponse(EditorSchema):
    id: uuid.UUID
    user_id: uuid.UUID = Field(alias="userId")
    project_id: uuid.UUID = Field(alias="projectId")
    model_asset_id: uuid.UUID = Field(alias="modelAssetId")
    name: str
    status: str
    revision: int
    design_config: dict[str, Any] = Field(alias="designConfig")
    preview_glb_url: str | None = Field(default=None, alias="previewGlbUrl")
    preview_status: Literal["none", "pending", "processing", "ready", "failed"] = Field(
        default="none",
        alias="previewStatus",
    )
    preview_error_message: str | None = Field(default=None, alias="previewErrorMessage")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class EditorPermissionsResponse(EditorSchema):
    can_edit: bool = Field(alias="canEdit")
    can_bake: bool = Field(alias="canBake")
    can_export: bool = Field(alias="canExport")


class EditorContextResponse(EditorSchema):
    project: EditorProjectResponse
    model_asset: EditorModelAssetResponse | None = Field(default=None, alias="modelAsset")
    latest_design: EditorDesignResponse | None = Field(default=None, alias="latestDesign")
    permissions: EditorPermissionsResponse
    model_status: Literal["raw", "ready"] | None = Field(default=None, alias="modelStatus")
    raw_model_asset_id: uuid.UUID | None = Field(default=None, alias="rawModelAssetId")


# Crop box contract of the desktop sidecar's /prepare (ar-ai-exe app/schemas/scan.py CropBox).
# provenance: bounds mirror that schema exactly so a job the API accepts is never rejected by the
# sidecar after it has been claimed — normalized model space (centre ±0.5, size (0.01, 1]).
class EditorCropVector(EditorSchema):
    x: float = Field(ge=-0.5, le=0.5)
    y: float = Field(ge=-0.5, le=0.5)
    z: float = Field(ge=-0.5, le=0.5)


class EditorCropSize(EditorSchema):
    x: float = Field(gt=0.01, le=1.0)
    y: float = Field(gt=0.01, le=1.0)
    z: float = Field(gt=0.01, le=1.0)


class EditorCropRotation(EditorSchema):
    x: float = Field(default=0.0, ge=-180.0, le=180.0)
    y: float = Field(default=0.0, ge=-180.0, le=180.0)
    z: float = Field(default=0.0, ge=-180.0, le=180.0)


class EditorCropBox(EditorSchema):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, extra="forbid")

    center: EditorCropVector
    size: EditorCropSize
    rotation: EditorCropRotation = Field(default_factory=EditorCropRotation)
    coordinate_space: Literal["normalized"] = Field(default="normalized", alias="coordinateSpace")


class EditorPrepareRequest(EditorSchema):
    crop_box: EditorCropBox = Field(alias="cropBox")
    confirm_reset_design: bool = Field(default=False, alias="confirmResetDesign")


JobType = Literal["bake", "prepare"]
JobStatus = Literal["awaiting_client", "claimed", "completed", "failed", "cancelled"]


class EditorJobResponse(EditorSchema):
    id: uuid.UUID
    type: JobType = "bake"
    status: JobStatus
    progress: int = Field(ge=0, le=100)
    error_message: str | None = Field(default=None, alias="errorMessage")
    design_id: uuid.UUID = Field(alias="designId")
    project_id: uuid.UUID = Field(alias="projectId")
    lease_expires_at: datetime | None = Field(default=None, alias="leaseExpiresAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class EditorJobClaimRequest(EditorSchema):
    # Informational only (stored in bake_jobs.worker_id, String(100)).
    device_label: str | None = Field(default=None, alias="deviceLabel", max_length=100)


class EditorJobClaimResponse(EditorSchema):
    job: EditorJobResponse
    claim_id: uuid.UUID = Field(alias="claimId")
    claim_token: str = Field(alias="claimToken")
    lease_expires_at: datetime = Field(alias="leaseExpiresAt")
    # Sidecar request body for /bake or /prepare (snake_case — the sidecar's own contract).
    payload: dict[str, Any]


class EditorJobOutput(EditorSchema):
    format: str = Field(min_length=1, max_length=20)
    file_path: str = Field(alias="filePath", min_length=1, max_length=512)
    file_size_bytes: int = Field(alias="fileSizeBytes", gt=0)


class EditorJobCompleteRequest(EditorSchema):
    outputs: list[EditorJobOutput] = Field(min_length=1, max_length=10)
    watermark_applied: bool = Field(default=False, alias="watermarkApplied")
    cleanup_report: dict[str, Any] | None = Field(default=None, alias="cleanupReport")


class EditorJobFailRequest(EditorSchema):
    code: str = Field(min_length=1, max_length=64)
    # UI display bound for bake_jobs.error_message (spec provenance table).
    message: str = Field(min_length=1, max_length=500)


class EditorContentUrlResponse(EditorSchema):
    """Presigned R2 URL for a file; the client downloads it directly (spec §B, ADR-004)."""

    url: str
    expires_in: int = Field(alias="expiresIn")
    filename: str
    content_type: str = Field(alias="contentType")


class EditorExportPackageResponse(EditorSchema):
    id: uuid.UUID
    design_id: uuid.UUID = Field(alias="designId")
    status: Literal["ready"] = "ready"
    download_url: str = Field(alias="downloadUrl")
    zip_url: str | None = Field(default=None, alias="zipUrl")
    files: list[str]
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
