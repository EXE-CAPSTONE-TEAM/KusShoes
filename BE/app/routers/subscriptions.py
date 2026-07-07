from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.subscription import (
    CancelSubscriptionRequest,
    ChangePlanRequest,
    CheckoutRequest,
    CheckoutResponse,
    InvoiceResponse,
    PlanResponse,
    PortalLinkResponse,
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


@router.post("/subscription/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    checkout_url = await billing_service.create_checkout_session(
        db, user, tier=body.tier, billing_cycle=body.billing_cycle
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


@router.post("/subscription/change-plan")
async def change_plan(
    body: ChangePlanRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await billing_service.change_plan(db, user, tier=body.tier, billing_cycle=body.billing_cycle)
    return {"status": "requested"}


@router.post("/subscription/portal", response_model=PortalLinkResponse)
async def get_portal_link(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    portal_url = await billing_service.get_customer_portal_url(db, user)
    return PortalLinkResponse(portal_url=portal_url)
