"""Row queries for the tai-chinh reports (daily-pnl, refunds, vat).

Every query drops internal accounts (BR-83) and fetches `limit` rows at most so the caller can
detect overflow (`ctx.max_rows + 1`). Shaping into report cells lives in services/reports."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.invoice import Invoice
from app.models.refund import Refund
from app.models.user import User


async def refund_ledger_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """Refunds created in [start, end): (created_at, receipt_number, order_code, customer_code,
    plan_tier, billing_cycle, invoice_amount_vnd, refund_amount_vnd, reason, admin_code)."""
    customer = aliased(User)
    admin = aliased(User)
    result = await db.execute(
        select(
            Refund.created_at,
            Invoice.receipt_number,
            Invoice.order_code,
            customer.account_code,
            Invoice.plan_tier,
            Invoice.billing_cycle,
            Invoice.amount_vnd,
            Refund.amount_vnd,
            Refund.reason,
            admin.account_code,
        )
        .join(Invoice, Invoice.id == Refund.invoice_id)
        .join(customer, customer.id == Invoice.user_id)
        .join(admin, admin.id == Refund.created_by)
        .where(
            customer.is_internal.is_(False),
            Refund.created_at >= start,
            Refund.created_at < end,
        )
        .order_by(Refund.created_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def paid_invoices_between(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """Paid invoices with paid_at in [start, end): (Invoice, customer_code)."""
    result = await db.execute(
        select(Invoice, User.account_code)
        .join(User, User.id == Invoice.user_id)
        .where(
            Invoice.status == "paid",
            Invoice.paid_at.is_not(None),
            Invoice.paid_at >= start,
            Invoice.paid_at < end,
            Invoice.amount_vnd > 0,
            User.is_internal.is_(False),
        )
        .order_by(Invoice.paid_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]
