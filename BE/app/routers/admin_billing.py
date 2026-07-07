import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.admin import CursorPage, InvoiceStatus, RefundResponse, SubscriptionStatus, SubscriptionTier
from app.schemas.subscription import AdminInvoiceResponse, AdminSubscriptionResponse
from app.services import billing_service
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
        db, status=status, user_id=user_id, limit=limit, before=before, before_id=before_id
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
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    polar_refund_id = await billing_service.admin_refund_invoice(db, admin, invoice_id)
    return RefundResponse(status="refund_requested", polar_refund_id=polar_refund_id)
