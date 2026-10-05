import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.credit import VatBreakdown


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


class SubscriptionBase(BaseModel):
    id: uuid.UUID
    tier: str
    status: str
    started_at: datetime
    expires_at: datetime | None
    cancel_at_period_end: bool


class SubscriptionResponse(SubscriptionBase):
    # BR-23 (SRS_v2.2.txt:1561): plan scans left this cycle, then spendable Credits.
    scans_remaining_plan: int
    scans_remaining_credit: int


class CheckoutRequest(BaseModel):
    tier: str
    billing_cycle: str
    gateway: Literal["payos", "momo"]
    coupon_code: str | None = Field(default=None, max_length=40)


class CheckoutResponse(BaseModel):
    checkout_url: str


class PaymentGatewaysResponse(BaseModel):
    """Which checkout gateways accept a payment right now (MoMo is behind MOMO_ENABLED)."""

    payos: bool
    momo: bool


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


class PaymentTransferDetails(BaseModel):
    transferred_at: datetime | None = None
    sender_name: str | None = None
    sender_account_number: str | None = None
    sender_bank_id: str | None = None
    sender_bank_name: str | None = None
    receiver_account_number: str | None = None
    virtual_account_name: str | None = None
    virtual_account_number: str | None = None
    bank_reference: str | None = None
    payment_link_id: str | None = None
    transfer_description: str | None = None
    currency: str | None = None


class SubscriptionPeriod(BaseModel):
    start: datetime | None = None
    end: datetime | None = None


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
    vat: VatBreakdown  # BR-28 (SRS_v2.2.txt:1643)
    transfer: PaymentTransferDetails | None = None
    subscription_period: SubscriptionPeriod | None = None
    # Bill line item + discount reason: Credit count for a Credit invoice, coupon/upgrade otherwise.
    credit_quantity: int | None = None
    coupon_code: str | None = None
    is_upgrade: bool = False


class AdminSubscriptionResponse(SubscriptionBase):
    user_id: uuid.UUID
    user_email: str | None
    last_invoice_id: uuid.UUID | None = None


class AdminInvoiceResponse(InvoiceResponse):
    user_id: uuid.UUID
    user_email: str | None
    payment_reference: str | None
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
    vat: VatBreakdown  # BR-28 on the final payable amount


class CheckoutQuoteRequest(BaseModel):
    tier: str
    billing_cycle: str
    coupon_code: str | None = Field(default=None, max_length=40)


class CheckoutBuyer(BaseModel):
    full_name: str | None = None
    email: str


class PlanQuoteDetails(BaseModel):
    tier: str
    billing_cycle: str
    price_vnd: int
    max_projects: int | None = None
    max_exports_per_month: int | None = None
    max_scans_per_cycle: int | None = None
    max_ai_credits_per_cycle: int | None = None


class CheckoutQuote(BaseModel):
    plan: PlanQuoteDetails
    listed_price_vnd: int
    discount_vnd: int
    discount_reason: Literal["coupon", "upgrade_proration"] | None = None
    coupon_code: str | None = None
    amount_vnd: int
    vat: VatBreakdown
    is_upgrade: bool
    current_tier: str | None = None
    new_period_start: datetime
    new_expires_at: datetime
    buyer: CheckoutBuyer


class CreditQuoteRequest(BaseModel):
    quantity: int = Field(gt=0, le=1000)


class CreditQuoteResponse(BaseModel):
    quantity: int
    unit_price_vnd: int
    total_vnd: int
    amount_vnd: int
    vat: VatBreakdown
    can_purchase: bool


class InvoiceListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    before: datetime | None = None
    before_id: uuid.UUID | None = None
