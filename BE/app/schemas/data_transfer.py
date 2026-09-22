"""DTOs for BR-65 watermark policy and BR-20 data import from a KusShoes backup."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


# --- BR-65 (SRS_v2.2.txt:1910) / BR-67 (SRS_v2.2.txt:1922) ---
class WatermarkPolicyResponse(BaseModel):
    required: bool
    text: str
    max_edge_px: int
    opacity_percent: int


# --- BR-20 (SRS_v2.2.txt:1510) ---
DataImportStatus = Literal["pending", "completed", "rejected"]


class DataImportUploadResponse(BaseModel):
    import_id: uuid.UUID
    upload_url: str
    storage_path: str
    expires_in: int
    max_bytes: int


class DataImportResultResponse(BaseModel):
    import_id: uuid.UUID
    status: DataImportStatus
    projects_imported: int
    # The BR-19 export carries metadata only (no GLB/texture binaries), so an import never
    # restores binary assets; clients show this so the user is not surprised.
    skipped_binary_assets: bool
    message: str


class DataImportHistoryItem(BaseModel):
    id: uuid.UUID
    status: DataImportStatus
    projects_imported: int
    rejected_reason: str | None
    file_size_bytes: int | None
    created_at: datetime
    completed_at: datetime | None
