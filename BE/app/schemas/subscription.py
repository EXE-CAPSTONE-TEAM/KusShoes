import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PlanResponse(BaseModel):
    id: uuid.UUID
    tier: str
    billing_cycle: str | None
    price_vnd: int
    max_projects: int | None
    max_exports_per_month: int | None
    allowed_export_formats: list[str]
    bake_priority: str
    max_ai_credits_per_cycle: int | None
    max_scans_per_cycle: int | None
    max_layers_per_zone: int
    max_layers_per_project: int
    allow_draw_artwork: bool


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    tier: str
    status: str
    started_at: datetime
    expires_at: datetime | None
    cancel_at_period_end: bool


class CheckoutRequest(BaseModel):
    tier: str
    billing_cycle: str
    gateway: Literal["payos", "momo"]
    coupon_code: str | None = Field(default=None, max_length=40)


class CheckoutResponse(BaseModel):
    checkout_url: str


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    order_code: int
    plan_tier: str
    billing_cycle: str
    listed_price_vnd: int
    discount_vnd: int
    amount_vnd: int
    payment_method: str
    status: str
    receipt_number: str | None = None
    paid_at: datetime | None
    created_at: datetime


class AdminSubscriptionResponse(SubscriptionResponse):
    user_id: uuid.UUID
    user_email: str | None


class AdminInvoiceResponse(InvoiceResponse):
    user_id: uuid.UUID
    user_email: str | None
    payment_reference: str | None
    coupon_code: str | None = None
    is_manual: bool = False
    collected_by: str | None = None
    created_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None


class RefundRequest(BaseModel):
    amount_vnd: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)
    # BR-97: approve a refund that falls outside the automatic policy.
    override: bool = False


class ReceiptResponse(BaseModel):
    receipt_number: str | None
    download_url: str
    expires_in: int = 900


class CouponPreviewRequest(BaseModel):
    tier: str
    billing_cycle: str
    coupon_code: str = Field(max_length=40)


class CouponPreviewResponse(BaseModel):
    listed_price_vnd: int
    discount_vnd: int
    amount_vnd: int


class InvoiceListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    before: datetime | None = None
