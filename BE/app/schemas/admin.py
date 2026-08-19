import uuid
from datetime import date, datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, BeforeValidator, EmailStr, Field

from app.types import JsonObject

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None


AdminSearchQuery = Annotated[
    str,
    BeforeValidator(lambda value: value.strip()),
    Field(max_length=200),
]
UserRole = Literal["user", "staff", "admin"]
UserStatus = Literal["active", "suspended"]
SubscriptionStatus = Literal["active", "cancelled", "expired"]
InvoiceStatus = Literal["pending", "paid", "failed", "refunded"]
BakeStatus = Literal["queued", "processing", "completed", "failed", "cancelled"]
BakePriority = Literal["low", "normal", "high"]
ExportFormat = Literal["glb", "obj", "zip"]
ProjectStatus = Literal["draft", "in_progress", "baking", "completed"]
SubscriptionTier = Literal[
    "free",
    "creator_monthly",
    "creator_yearly",
    "pro_monthly",
    "pro_yearly",
]


# --- Dashboard ---
class AdminStatsResponse(BaseModel):
    total_users: int
    mrr_vnd: int
    total_exports: int


class MonthlyPoint(BaseModel):
    month: date
    value: int


class AdminRecentUserItem(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    plan_tier: str
    status: str
    mrr_vnd: int
    created_at: datetime


# --- Users ---
class AdminUserListItem(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    account_code: str
    role: str
    status: str
    is_verified: bool
    deleted_at: datetime | None
    created_at: datetime


class AdminUserDetailResponse(AdminUserListItem):
    first_name: str | None
    last_name: str | None
    subscription_tier: str | None
    subscription_status: str | None
    subscription_expires_at: datetime | None
    projects_count_this_month: int
    exports_count_this_month: int
    total_projects: int


class BanRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class StaffCreateRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)


class StaffCreateResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    account_code: str
    role: str


# --- Plans ---
class AdminPlanResponse(BaseModel):
    id: uuid.UUID
    tier: str
    billing_cycle: str | None
    price_vnd: int
    max_projects: int | None
    max_exports_per_month: int | None
    allowed_export_formats: list[str]
    bake_priority: str
    is_active: bool
    polar_product_id: str | None


class PlanUpdateRequest(BaseModel):
    price_vnd: int | None = Field(default=None, ge=0)
    max_projects: int | None = Field(default=None, ge=0)
    max_exports_per_month: int | None = Field(default=None, ge=0)
    allowed_export_formats: list[ExportFormat] | None = None
    bake_priority: BakePriority | None = None
    polar_product_id: str | None = None
    is_active: bool | None = None


# --- Projects / Bake / Exports ---
class AdminProjectListItem(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    user_id: uuid.UUID
    owner_email: str | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminProjectDetailResponse(AdminProjectListItem):
    description: str | None
    asset_count: int
    latest_bake_status: str | None


class AdminBakeJobResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str | None
    status: str
    priority: str
    error_message: str | None
    worker_id: str | None
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class AdminBakeJobDetailResponse(AdminBakeJobResponse):
    design_config_snapshot: JsonObject


class AdminExportRecordResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str | None
    user_id: uuid.UUID
    user_email: str | None
    format: str
    file_path: str
    created_at: datetime


# --- Audit / Health / Refund ---
class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    actor_email: str | None
    actor_role: str
    action: str
    target_type: str | None
    target_id: str | None
    payload: dict | None
    created_at: datetime


class SystemHealthResponse(BaseModel):
    status: str
    checks: dict
    queue_depths: dict
    bake_jobs_by_status: dict


class RefundResponse(BaseModel):
    status: str
    polar_refund_id: str
