import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.user import User


async def create_pending(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan_id: uuid.UUID | None,
    plan_tier: str,
    billing_cycle: str,
    amount_vnd: int,
    payment_method: str = "polar",
    gateway_transaction_id: str | None = None,
    gateway_payment_url: str | None = None,
    gateway_metadata: dict | None = None,
) -> Invoice:
    invoice = Invoice(
        user_id=user_id,
        plan_id=plan_id,
        plan_tier=plan_tier,
        billing_cycle=billing_cycle,
        amount_vnd=amount_vnd,
        payment_method=payment_method,
        gateway_transaction_id=gateway_transaction_id,
        gateway_payment_url=gateway_payment_url,
        gateway_metadata=gateway_metadata,
        status="pending",
    )
    db.add(invoice)
    await db.flush()
    return invoice


async def get_by_id(db: AsyncSession, invoice_id: uuid.UUID) -> Invoice | None:
    return await db.get(Invoice, invoice_id)


async def get_by_gateway_transaction_id(
    db: AsyncSession, gateway_transaction_id: str
) -> Invoice | None:
    result = await db.execute(
        select(Invoice).where(Invoice.gateway_transaction_id == gateway_transaction_id)
    )
    return result.scalar_one_or_none()


async def mark_paid(
    db: AsyncSession, invoice: Invoice, *, paid_at: datetime, gateway_metadata_patch: dict
) -> Invoice:
    invoice.status = "paid"
    invoice.paid_at = paid_at
    invoice.gateway_metadata = {**(invoice.gateway_metadata or {}), **gateway_metadata_patch}
    await db.flush()
    return invoice


async def mark_failed(db: AsyncSession, invoice: Invoice) -> Invoice:
    invoice.status = "failed"
    await db.flush()
    return invoice


async def mark_refunded(db: AsyncSession, invoice: Invoice) -> Invoice:
    invoice.status = "refunded"
    await db.flush()
    return invoice


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[Invoice]:
    query = select(Invoice).where(Invoice.user_id == user_id)
    if before is not None:
        if before_id is not None:
            query = query.where((Invoice.created_at < before) | ((Invoice.created_at == before) & (Invoice.id < before_id)))
        else:
            query = query.where(Invoice.created_at < before)
    query = query.order_by(Invoice.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())


async def list_all(
    db: AsyncSession,
    *,
    status: str | None = None,
    user_id: uuid.UUID | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[Invoice, str | None]]:
    query = select(Invoice, User.email).outerjoin(User, User.id == Invoice.user_id)
    if status is not None:
        query = query.where(Invoice.status == status)
    if user_id is not None:
        query = query.where(Invoice.user_id == user_id)
    if before is not None:
        if before_id is not None:
            query = query.where((Invoice.created_at < before) | ((Invoice.created_at == before) & (Invoice.id < before_id)))
        else:
            query = query.where(Invoice.created_at < before)
    query = query.order_by(Invoice.created_at.desc(), Invoice.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(invoice, user_email) for invoice, user_email in result.all()]
