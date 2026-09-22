"""DTOs for BR-94 scan Credits, BR-23 scan quota and BR-28 VAT."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VatBreakdown(BaseModel):
    """BR-28 (SRS_v2.2.txt:1643): VAT extracted from the amount paid, never added."""

    enabled: bool
    rate_percent: int
    vat_vnd: int
    net_vnd: int


class TaxConfigResponse(BaseModel):
    enabled: bool
    rate_percent: int


class CreditCheckoutRequest(BaseModel):
    # extra="forbid": BR-91 (SRS_v2.2.txt:1597) promotions do not apply to Credit, so a
    # coupon_code on this route is rejected instead of silently ignored. The upper bound
    # on quantity is enforced by credit_service against settings.CREDIT_MAX_PER_CYCLE.
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(ge=1)
    gateway: Literal["payos", "momo"]


class CreditBalanceResponse(BaseModel):
    available: int
    used: int
    expired: int
    purchased_this_cycle: int
    max_per_cycle: int
    price_vnd: int
    next_expires_at: datetime | None
    can_purchase: bool
    cycle_start: datetime


class CreditLedgerItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID | None
    purchased_at: datetime
    expires_at: datetime
    status: str
    consumed_at: datetime | None
    consumed_ref: str | None
    price_vnd: int


class CreditLedgerResponse(BaseModel):
    items: list[CreditLedgerItem]
    next_cursor: str | None
    has_next: bool


class ScanConsumeRequest(BaseModel):
    user_id: uuid.UUID
    reference: str = Field(min_length=8, max_length=100)


class ScanConsumeResponse(BaseModel):
    source: Literal["plan", "credit"]
    plan_remaining: int
    credit_available: int


class ScanBalanceResponse(BaseModel):
    plan_remaining: int
    credit_available: int
    cycle_start: datetime
    resets_at: datetime | None
    # Same rule as quota_service.assert_scan_available (GRACE first, then balance).
    can_scan: bool
    blocked_code: str | None
