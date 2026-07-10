import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class EditorUserResponse(BaseModel):
    id: uuid.UUID
    role: str
    name: str
    email: str
    createdAt: datetime
    updatedAt: datetime | None = None


class EditorProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    thumbnailUrl: str | None = None
    sourceType: str
    createdAt: datetime
    updatedAt: datetime


class EditorModelAssetResponse(BaseModel):
    id: uuid.UUID
    scanSessionId: str
    projectId: uuid.UUID
    status: str
    sourceType: str
    glbUrl: str
    canonicalGlbUrl: str | None = None
    objUrl: str = ""
    mtlUrl: str = ""
    textureUrl: str = ""
    textureUrls: list[str] = Field(default_factory=list)
    metadataUrl: str = ""
    qualityReportUrl: str = ""
    objPackageZipUrl: str = ""
    qualityReport: dict = Field(default_factory=dict)
    createdAt: datetime
    updatedAt: datetime | None = None


class EditorDesignResponse(BaseModel):
    id: str
    userId: uuid.UUID
    projectId: uuid.UUID
    modelAssetId: uuid.UUID
    name: str
    status: str
    designConfig: dict
    previewGlbUrl: str | None = None
    previewStatus: str = "none"
    previewErrorMessage: str | None = None
    createdAt: datetime
    updatedAt: datetime


class EditorPermissionsResponse(BaseModel):
    canEdit: bool
    canBake: bool
    canExport: bool


class EditorContextResponse(BaseModel):
    user: EditorUserResponse
    project: EditorProjectResponse
    modelAsset: EditorModelAssetResponse | None
    latestDesign: EditorDesignResponse | None
    permissions: EditorPermissionsResponse


class EditorSaveDesignRequest(BaseModel):
    designConfig: dict
    name: str | None = None
