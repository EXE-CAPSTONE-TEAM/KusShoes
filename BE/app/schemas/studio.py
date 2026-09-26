import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.types import JsonObject


# --- Design versions ---
class DesignVersionItem(BaseModel):
    id: uuid.UUID
    version_no: int
    is_pinned: bool
    export_bake_job_id: uuid.UUID | None
    thumbnail_path: str | None
    created_at: datetime


class DesignVersionDetail(DesignVersionItem):
    design_config: JsonObject


# --- Guardrail ---
class GuardrailRuleCreate(BaseModel):
    kind: Literal["banned", "trademark"]
    term: str = Field(min_length=2, max_length=100)


class GuardrailRuleUpdate(BaseModel):
    is_active: bool


class GuardrailRuleResponse(BaseModel):
    id: uuid.UUID
    kind: str
    term: str
    is_active: bool


# --- Templates ---
class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, max_length=50)
    design_config: JsonObject
    thumbnail_path: str | None = Field(default=None, max_length=1000)


class TemplateListItem(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    thumbnail_path: str | None
    layer_count: int
    use_count: int


class AdminTemplateResponse(TemplateListItem):
    status: str
    created_at: datetime


# --- Artisan links ---
class ArtisanLinkCreate(BaseModel):
    export_id: uuid.UUID | None = None  # default: newest export of the project


class ArtisanLinkResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    export_record_id: uuid.UUID
    expires_at: datetime
    max_downloads: int
    download_count: int
    revoked_at: datetime | None
    is_active: bool


class ArtisanLinkCreated(ArtisanLinkResponse):
    token: str  # shown once — only its hash is stored
    url: str


class ArtisanPublicView(BaseModel):
    project_id: uuid.UUID  # lets the public viewer file a content report against this project
    project_name: str
    format: str
    expires_at: datetime
    downloads_remaining: int


class ArtisanDownloadResponse(BaseModel):
    download_url: str
    expires_in_seconds: int
