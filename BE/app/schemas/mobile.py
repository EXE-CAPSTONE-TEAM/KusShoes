import uuid
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

OpaqueToken = Annotated[
    str,
    StringConstraints(
        min_length=32,
        max_length=256,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]


class MobileScanBootstrapRequest(BaseModel):
    client_request_id: uuid.UUID
    project_name: str = Field(default="Untitled shoe scan", min_length=1, max_length=100)

    @field_validator("project_name")
    @classmethod
    def normalize_project_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tên project không được để trống")
        return normalized


class MobileScanBootstrapResponse(BaseModel):
    project_id: uuid.UUID
    compute_api_url: str
    compute_grant: OpaqueToken
    expires_in: int
    web_project_url: str


class MobileComputeGrantClaimRequest(BaseModel):
    compute_grant: OpaqueToken


class MobileComputeGrantClaimResponse(BaseModel):
    user_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    completion_token: OpaqueToken
    web_project_url: str


class MobileOutputUploadRequest(BaseModel):
    completion_token: OpaqueToken


class MobileOutputUploadResponse(BaseModel):
    project_id: uuid.UUID
    asset_id: uuid.UUID
    file_path: str
    upload_url: str | None
    expires_in: int
    already_completed: bool = False


class MobileOutputConfirmRequest(BaseModel):
    completion_token: OpaqueToken
    asset_id: uuid.UUID
    file_size_bytes: int = Field(gt=0)
    project_name: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("project_name")
    @classmethod
    def normalize_optional_project_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tên project không được để trống")
        return normalized


class MobileOutputConfirmResponse(BaseModel):
    project_id: uuid.UUID
    model_asset_id: uuid.UUID
    status: str
    web_project_url: str
