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
    status: Literal["uploaded", "processing", "ready", "failed"]
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


class EditorJobResponse(EditorSchema):
    id: uuid.UUID
    type: Literal["bake"] = "bake"
    status: Literal["queued", "processing", "completed", "failed"]
    progress: int = Field(ge=0, le=100)
    error_message: str | None = Field(default=None, alias="errorMessage")
    design_id: uuid.UUID = Field(alias="designId")
    project_id: uuid.UUID = Field(alias="projectId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class EditorExportPackageResponse(EditorSchema):
    id: uuid.UUID
    design_id: uuid.UUID = Field(alias="designId")
    status: Literal["ready"] = "ready"
    download_url: str = Field(alias="downloadUrl")
    zip_url: str | None = Field(default=None, alias="zipUrl")
    files: list[str]
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
