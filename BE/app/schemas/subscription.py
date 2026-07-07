import uuid
from datetime import datetime

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


class CheckoutResponse(BaseModel):
    checkout_url: str


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


class ChangePlanRequest(BaseModel):
    tier: str
    billing_cycle: str


class PortalLinkResponse(BaseModel):
    portal_url: str


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    plan_tier: str
    billing_cycle: str
    amount_vnd: int
    payment_method: str
    status: str
    paid_at: datetime | None
    created_at: datetime


class AdminSubscriptionResponse(SubscriptionResponse):
    user_id: uuid.UUID
    user_email: str | None


class AdminInvoiceResponse(InvoiceResponse):
    user_id: uuid.UUID
    user_email: str | None
    polar_order_id: str | None


class InvoiceListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    before: datetime | None = None
