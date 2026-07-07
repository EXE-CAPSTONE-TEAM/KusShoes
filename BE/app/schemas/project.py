import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)


class SaveDesignRequest(BaseModel):
    design_config: dict
    thumbnail_path: str | None = Field(default=None, max_length=1000)


class TriggerBakeRequest(BaseModel):
    design_config: dict


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    thumbnail_path: str | None
    editor_url: str
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectResponse):
    design_config: dict | None
    canonical_model_asset_id: uuid.UUID | None


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    next_cursor: str | None
    has_next: bool


class TrashProjectResponse(ProjectResponse):
    deleted_at: datetime
    purge_at: datetime


class ProjectTrashListResponse(BaseModel):
    items: list[TrashProjectResponse]
    next_cursor: str | None
    has_next: bool


class BakeJobResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    priority: str


class BakeJobStatusResponse(BakeJobResponse):
    error_message: str | None
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    can_retry: bool = False
    can_cancel: bool = False
    poll_after_seconds: int | None = None


class ExportResponse(BaseModel):
    id: uuid.UUID
    format: str
    file_size_bytes: int | None
    download_count: int
    created_at: datetime


class ExportListResponse(BaseModel):
    items: list[ExportResponse]
