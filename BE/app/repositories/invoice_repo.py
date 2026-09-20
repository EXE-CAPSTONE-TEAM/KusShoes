import uuid
from datetime import datetime

from sqlalchemy import select, text
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
    order_code: int,
    listed_price_vnd: int,
    amount_vnd: int,
    payment_method: str,
    discount_vnd: int = 0,
    coupon_code: str | None = None,
    is_upgrade: bool = False,
    gateway_transaction_id: str | None = None,
    gateway_payment_url: str | None = None,
    gateway_metadata: dict | None = None,
) -> Invoice:
    invoice = Invoice(
        user_id=user_id,
        plan_id=plan_id,
        plan_tier=plan_tier,
        billing_cycle=billing_cycle,
        order_code=order_code,
        listed_price_vnd=listed_price_vnd,
        discount_vnd=discount_vnd,
        coupon_code=coupon_code,
        is_upgrade=is_upgrade,
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


async def get_by_order_code(db: AsyncSession, order_code: int) -> Invoice | None:
    result = await db.execute(select(Invoice).where(Invoice.order_code == order_code))
    return result.scalar_one_or_none()


async def get_by_gateway_transaction_id(
    db: AsyncSession, gateway_transaction_id: str
) -> Invoice | None:
    result = await db.execute(
        select(Invoice).where(Invoice.gateway_transaction_id == gateway_transaction_id)
    )
    return result.scalar_one_or_none()


async def mark_paid(
    db: AsyncSession,
    invoice: Invoice,
    *,
    paid_at: datetime,
    payment_reference: str | None = None,
    gateway_metadata_patch: dict | None = None,
) -> Invoice:
    invoice.status = "paid"
    invoice.paid_at = paid_at
    if payment_reference is not None:
        invoice.payment_reference = payment_reference
    if gateway_metadata_patch:
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
    payment_method: str | None = None,
    is_manual: bool | None = None,
    exclude_internal: bool = False,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[Invoice, str | None]]:
    query = select(Invoice, User.email).outerjoin(User, User.id == Invoice.user_id)
    if status is not None:
        query = query.where(Invoice.status == status)
    if user_id is not None:
        query = query.where(Invoice.user_id == user_id)
    if payment_method is not None:
        query = query.where(Invoice.payment_method == payment_method)
    if is_manual is not None:
        query = query.where(Invoice.is_manual.is_(is_manual))
    if exclude_internal:
        query = query.where(User.is_internal.is_(False))
    if date_from is not None:
        query = query.where(Invoice.created_at >= date_from)
    if date_to is not None:
        query = query.where(Invoice.created_at < date_to)
    if before is not None:
        if before_id is not None:
            query = query.where((Invoice.created_at < before) | ((Invoice.created_at == before) & (Invoice.id < before_id)))
        else:
            query = query.where(Invoice.created_at < before)
    query = query.order_by(Invoice.created_at.desc(), Invoice.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(invoice, user_email) for invoice, user_email in result.all()]


async def has_paid_invoice(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """BR-26/91: has this account ever completed a paid (amount > 0) transaction?"""
    result = await db.execute(
        select(Invoice.id)
        .where(
            Invoice.user_id == user_id,
            Invoice.status.in_(("paid", "refunded")),
            Invoice.amount_vnd > 0,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def mark_cancelled(db: AsyncSession, invoice: Invoice) -> Invoice:
    invoice.status = "cancelled"
    await db.flush()
    return invoice


async def list_stale_pending(db: AsyncSession, *, before: datetime) -> list[Invoice]:
    """SF-06: gateway invoices still PENDING past the 30-minute window."""
    result = await db.execute(
        select(Invoice).where(
            Invoice.status == "pending",
            Invoice.is_manual.is_(False),
            Invoice.created_at < before,
        )
    )
    return list(result.scalars())


async def create_manual(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    plan_tier: str,
    billing_cycle: str,
    order_code: int,
    listed_price_vnd: int,
    amount_vnd: int,
    paid_at: datetime,
    collected_by: str,
    proof_path: str,
    manual_reason: str,
    created_by: uuid.UUID,
) -> Invoice:
    invoice = Invoice(
        user_id=user_id,
        plan_id=plan_id,
        plan_tier=plan_tier,
        billing_cycle=billing_cycle,
        order_code=order_code,
        listed_price_vnd=listed_price_vnd,
        discount_vnd=max(listed_price_vnd - amount_vnd, 0),
        amount_vnd=amount_vnd,
        payment_method="manual",
        status="awaiting_approval",
        paid_at=paid_at,
        is_manual=True,
        collected_by=collected_by,
        proof_path=proof_path,
        manual_reason=manual_reason,
        created_by=created_by,
    )
    db.add(invoice)
    await db.flush()
    return invoice


async def next_receipt_seq(db: AsyncSession) -> int:
    return (await db.execute(text("SELECT nextval('receipt_number_seq')"))).scalar_one()
