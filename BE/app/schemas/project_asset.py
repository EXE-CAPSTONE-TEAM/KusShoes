import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AssetType = Literal["source_model", "sticker", "texture", "reference_image"]


class AssetUploadURLRequest(BaseModel):
    asset_type: AssetType
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)


class AssetUploadURLResponse(BaseModel):
    upload_url: str
    asset_id: uuid.UUID
    file_path: str
    expires_in: int = 900


class AssetConfirmRequest(BaseModel):
    asset_id: uuid.UUID
    # Backward-compatible integrity hint only; storage metadata is authoritative.
    file_size_bytes: int | None = Field(default=None, gt=0, le=2_000_000_000)


class AssetResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    asset_type: str
    original_filename: str | None
    file_path: str
    file_size_bytes: int | None
    mime_type: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetListResponse(BaseModel):
    items: list[AssetResponse]
