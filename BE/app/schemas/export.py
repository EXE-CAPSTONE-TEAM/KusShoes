import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ExportHistoryItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    format: Literal["glb", "obj", "zip"]
    file_size_bytes: int | None
    download_count: int
    created_at: datetime


class ExportHistoryResponse(BaseModel):
    items: list[ExportHistoryItem]
    next_cursor: str | None
    has_next: bool


class ExportDownloadResponse(BaseModel):
    download_url: str
    expires_in: int = 3600
