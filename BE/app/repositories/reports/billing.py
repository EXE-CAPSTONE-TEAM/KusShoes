"""Reports hub queries for the `goi-thanh-toan` domain. Internal accounts (BR-83) are excluded;
every list is capped at `limit` (callers pass ReportContext.max_rows + 1 to detect overflow)."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.subscription import Subscription
from app.models.user import User

# Invoices that never became revenue and are still worth chasing (accounts receivable / failures).
UNPAID_STATUSES = ("failed", "cancelled", "pending", "awaiting_approval")


async def subscription_snapshot(db: AsyncSession, *, limit: int) -> list[tuple]:
    """(account_code, tier, status, started_at, expires_at, grace_until, is_comp,
    cancel_at_period_end) for every non-internal customer, current state."""
    result = await db.execute(
        select(
            User.account_code,
            Subscription.tier,
            Subscription.status,
            Subscription.started_at,
            Subscription.expires_at,
            Subscription.grace_until,
            Subscription.is_comp,
            Subscription.cancel_at_period_end,
        )
        .join(User, User.id == Subscription.user_id)
        .where(User.is_internal.is_(False), User.deleted_at.is_(None))
        .order_by(User.account_code)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def unpaid_invoices(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(order_code, created_at, account_code, plan_tier, billing_cycle, amount_vnd, status,
    payment_method, is_manual) created in [start, end)."""
    result = await db.execute(
        select(
            Invoice.order_code,
            Invoice.created_at,
            User.account_code,
            Invoice.plan_tier,
            Invoice.billing_cycle,
            Invoice.amount_vnd,
            Invoice.status,
            Invoice.payment_method,
            Invoice.is_manual,
        )
        .join(User, User.id == Invoice.user_id)
        .where(
            Invoice.status.in_(UNPAID_STATUSES),
            Invoice.created_at >= start,
            Invoice.created_at < end,
            User.is_internal.is_(False),
        )
        .order_by(Invoice.created_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def coupon_invoice_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(invoice_id, coupon_code, discount_vnd) of paid/refunded invoices carrying a coupon,
    paid in [start, end). Net revenue is derived in the service from the refund ledger."""
    result = await db.execute(
        select(Invoice.id, Invoice.coupon_code, Invoice.discount_vnd)
        .join(User, User.id == Invoice.user_id)
        .where(
            Invoice.coupon_code.is_not(None),
            Invoice.status.in_(["paid", "refunded"]),
            Invoice.paid_at >= start,
            Invoice.paid_at < end,
            User.is_internal.is_(False),
        )
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]
