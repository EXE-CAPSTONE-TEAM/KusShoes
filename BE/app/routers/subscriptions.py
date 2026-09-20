import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import forbid_impersonation, get_current_user
from app.schemas.subscription import (
    CancelSubscriptionRequest,
    CheckoutRequest,
    CheckoutResponse,
    CouponPreviewRequest,
    CouponPreviewResponse,
    InvoiceResponse,
    PlanResponse,
    ReceiptResponse,
    SubscriptionResponse,
)
from app.services import billing_service

router = APIRouter()


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    return await billing_service.list_plans(db)


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await billing_service.get_current_subscription(db, user)


@router.get("/subscription/invoices", response_model=list[InvoiceResponse])
async def list_invoices(
    limit: int = 20,
    before: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await billing_service.list_invoices(db, user, limit=limit, before=before)


@router.post("/subscription/checkout", response_model=CheckoutResponse, dependencies=[Depends(forbid_impersonation)])
async def create_checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    checkout_url = await billing_service.create_checkout_session(
        db,
        user,
        tier=body.tier,
        billing_cycle=body.billing_cycle,
        gateway=body.gateway,
        coupon_code=body.coupon_code,
    )
    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/subscription/cancel")
async def cancel_subscription(
    body: CancelSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await billing_service.cancel_subscription(db, user, immediate=body.immediate)
    return {"status": "requested"}


@router.get("/subscription/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """MSG29: the checkout-success page polls this until status leaves 'pending'."""
    return await billing_service.get_user_invoice(db, user, invoice_id)


@router.get("/subscription/invoices/{invoice_id}/receipt", response_model=ReceiptResponse)
async def get_receipt(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    invoice = await billing_service.get_user_invoice(db, user, invoice_id)
    url = await billing_service.get_receipt_url(db, user, invoice_id)
    return ReceiptResponse(receipt_number=invoice.receipt_number, download_url=url)


@router.post("/subscription/coupon/preview", response_model=CouponPreviewResponse)
async def preview_coupon(
    body: CouponPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await billing_service.preview_coupon(
        db, user, tier=body.tier, billing_cycle=body.billing_cycle, coupon_code=body.coupon_code
    )
