import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ManualTransactionCreate(BaseModel):
    user_id: uuid.UUID
    tier: Literal["basic", "pro"]
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    amount_vnd: int = Field(gt=0)
    paid_on: date
    collected_by: str = Field(min_length=1, max_length=100)
    proof_path: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=500)


class ProofUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]


class ProofUploadResponse(BaseModel):
    upload_url: str
    file_path: str
    expires_in: int = 900


class RejectManualRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ReportingPeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date


class ReportingPeriodResponse(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: str
    locked_by: uuid.UUID | None
    locked_at: datetime | None


class CouponCreate(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    discount_type: Literal["percent", "fixed", "fixed_price"]
    value: int = Field(gt=0)
    plan_tiers: list[Literal["basic", "pro"]] | None = None
    first_payment_only: bool = False
    max_uses: int | None = Field(default=None, gt=0)
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class CouponUpdate(BaseModel):
    value: int | None = Field(default=None, gt=0)
    plan_tiers: list[Literal["basic", "pro"]] | None = None
    first_payment_only: bool | None = None
    max_uses: int | None = Field(default=None, gt=0)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class CouponResponse(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    value: int
    plan_tiers: list[str] | None
    first_payment_only: bool
    max_uses: int | None
    used_count: int
    valid_from: datetime | None
    valid_until: datetime | None
    is_active: bool


class GrantCompRequest(BaseModel):
    """BR-103: admin-granted plan for support/compensation — no revenue."""

    tier: Literal["basic", "pro"]
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    days: int = Field(default=30, ge=1, le=365)
    reason: str = Field(min_length=1, max_length=500)
