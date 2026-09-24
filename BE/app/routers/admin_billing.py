import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.admin import (
    CursorPage,
    InvoiceStatus,
    RefundResponse,
    SubscriptionStatus,
    SubscriptionTier,
)
from app.schemas.credit import TaxConfigResponse
from app.schemas.finance import (
    CouponCreate,
    CouponResponse,
    CouponUpdate,
    ManualTransactionCreate,
    ProofUploadRequest,
    ProofUploadResponse,
    RejectManualRequest,
    ReportingPeriodCreate,
    ReportingPeriodResponse,
)
from app.schemas.subscription import AdminInvoiceResponse, AdminSubscriptionResponse, RefundRequest
from app.services import (
    billing_service,
    coupon_service,
    finance_service,
    period_service,
    tax_service,
)
from app.utils.pagination import decode_cursor, encode_cursor

router = APIRouter()


@router.get("/billing/subscriptions", response_model=CursorPage[AdminSubscriptionResponse])
async def list_subscriptions(
    tier: SubscriptionTier | None = None,
    status: SubscriptionStatus | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded

    items = await billing_service.admin_list_subscriptions(
        db, tier=tier, status=status, limit=limit, before=before, before_id=before_id
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at if hasattr(last, 'created_at') else last.started_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)


@router.get("/billing/invoices", response_model=CursorPage[AdminInvoiceResponse])
async def list_invoices(
    status: InvoiceStatus | None = None,
    user_id: uuid.UUID | None = None,
    payment_method: Literal["payos", "momo", "manual"] | None = None,
    is_manual: bool | None = None,
    exclude_internal: bool = False,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded

    items = await billing_service.admin_list_invoices(
        db,
        status=status,
        user_id=user_id,
        payment_method=payment_method,
        is_manual=is_manual,
        exclude_internal=exclude_internal,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        before=before,
        before_id=before_id,
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)


@router.post("/billing/subscriptions/{user_id}/force-downgrade")
async def force_downgrade(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await billing_service.admin_force_downgrade(db, admin, user_id)
    return {"status": "downgraded"}


@router.post("/billing/invoices/{invoice_id}/refund", response_model=RefundResponse)
async def refund_invoice(
    invoice_id: uuid.UUID,
    body: RefundRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    refund_id = await billing_service.admin_refund_invoice(
        db,
        admin,
        invoice_id,
        amount_vnd=body.amount_vnd,
        reason=body.reason,
        override=body.override,
    )
    return RefundResponse(status="refunded", refund_id=refund_id)


# --- UC-28 manual transactions (BR-95) ---


@router.post("/billing/manual-transactions/proof-upload", response_model=ProofUploadResponse)
async def manual_proof_upload(
    body: ProofUploadRequest, admin=Depends(get_current_admin_write)
):
    return finance_service.create_proof_upload(admin, body)


@router.post(
    "/billing/manual-transactions", response_model=AdminInvoiceResponse, status_code=201
)
async def create_manual_transaction(
    body: ManualTransactionCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    invoice = await finance_service.create_manual_transaction(
        db, admin, **body.model_dump()
    )
    return billing_service.to_admin_invoice(invoice, None)


@router.post("/billing/invoices/{invoice_id}/approve", response_model=AdminInvoiceResponse)
async def approve_manual_transaction(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    invoice = await finance_service.approve_manual_transaction(db, admin, invoice_id)
    return billing_service.to_admin_invoice(invoice, None)


@router.post("/billing/invoices/{invoice_id}/reject", response_model=AdminInvoiceResponse)
async def reject_manual_transaction(
    invoice_id: uuid.UUID,
    body: RejectManualRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    invoice = await finance_service.reject_manual_transaction(db, admin, invoice_id, body.reason)
    return billing_service.to_admin_invoice(invoice, None)


# --- UC-29 reporting periods (BR-98) ---


@router.get("/billing/periods", response_model=list[ReportingPeriodResponse])
async def list_periods(db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)):
    return await period_service.list_periods(db)


@router.post("/billing/periods", response_model=ReportingPeriodResponse, status_code=201)
async def create_period(
    body: ReportingPeriodCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await period_service.create_period(db, admin, **body.model_dump())


@router.post("/billing/periods/{period_id}/lock", response_model=ReportingPeriodResponse)
async def lock_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await period_service.lock_period(db, admin, period_id)


# --- UC-23 coupons (BR-26) ---


@router.get("/billing/coupons", response_model=list[CouponResponse])
async def list_coupons(db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)):
    return await coupon_service.list_coupons(db)


@router.post("/billing/coupons", response_model=CouponResponse, status_code=201)
async def create_coupon(
    body: CouponCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await coupon_service.create_coupon(db, admin, body.model_dump())


@router.patch("/billing/coupons/{coupon_id}", response_model=CouponResponse)
async def update_coupon(
    coupon_id: uuid.UUID,
    body: CouponUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await coupon_service.update_coupon(
        db, admin, coupon_id, body.model_dump(exclude_unset=True)
    )


@router.get("/billing/tax-config", response_model=TaxConfigResponse)
async def get_tax_config(admin=Depends(get_current_admin)):
    """BR-28 (SRS_v2.2.txt:1643): live VAT toggle and rate."""
    return tax_service.tax_config()
