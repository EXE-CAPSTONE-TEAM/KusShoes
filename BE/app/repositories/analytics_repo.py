"""Raw rows for the SRS §5.4 business metrics.

Every query drops internal accounts (BR-83). Aggregation stays in
analytics_service so the metric definitions live next to each other."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.project import Project
from app.models.refund import Refund
from app.models.subscription import Subscription
from app.models.user import User


async def paid_invoice_rows(db: AsyncSession) -> list[tuple]:
    """(invoice_id, user_id, paid_at, amount_vnd, billing_cycle, plan_tier, is_upgrade,
    is_manual, payment_method, order_code, receipt_number, status)."""
    result = await db.execute(
        select(
            Invoice.id,
            Invoice.user_id,
            Invoice.paid_at,
            Invoice.amount_vnd,
            Invoice.billing_cycle,
            Invoice.plan_tier,
            Invoice.is_upgrade,
            Invoice.is_manual,
            Invoice.payment_method,
            Invoice.order_code,
            Invoice.receipt_number,
            Invoice.status,
        )
        .join(User, User.id == Invoice.user_id)
        .where(
            Invoice.paid_at.is_not(None),
            Invoice.status.in_(["paid", "refunded"]),
            Invoice.amount_vnd > 0,
            User.is_internal.is_(False),
        )
        .order_by(Invoice.paid_at)
    )
    return [tuple(row) for row in result.all()]


async def refund_rows(db: AsyncSession) -> list[tuple]:
    """(invoice_id, user_id, amount_vnd, created_at)."""
    result = await db.execute(
        select(Refund.invoice_id, Invoice.user_id, Refund.amount_vnd, Refund.created_at)
        .join(Invoice, Invoice.id == Refund.invoice_id)
        .join(User, User.id == Invoice.user_id)
        .where(User.is_internal.is_(False))
    )
    return [tuple(row) for row in result.all()]


async def failed_invoice_rows(db: AsyncSession, *, since: datetime) -> list[tuple]:
    """(user_id, amount_vnd, created_at) for failed payments."""
    result = await db.execute(
        select(Invoice.user_id, Invoice.amount_vnd, Invoice.created_at)
        .join(User, User.id == Invoice.user_id)
        .where(
            Invoice.status == "failed",
            Invoice.created_at >= since,
            User.is_internal.is_(False),
        )
    )
    return [tuple(row) for row in result.all()]


async def user_rows(db: AsyncSession) -> list[tuple]:
    """(user_id, email, created_at, is_verified, acquisition_channel) — customers only."""
    result = await db.execute(
        select(
            User.id, User.email, User.created_at, User.is_verified, User.acquisition_channel
        ).where(User.role == "user", User.is_internal.is_(False), User.deleted_at.is_(None))
    )
    return [tuple(row) for row in result.all()]


async def subscription_rows(db: AsyncSession) -> list[tuple]:
    """(user_id, tier, status, is_comp) — internal accounts excluded."""
    result = await db.execute(
        select(Subscription.user_id, Subscription.tier, Subscription.status, Subscription.is_comp)
        .join(User, User.id == Subscription.user_id)
        .where(User.is_internal.is_(False), User.deleted_at.is_(None))
    )
    return [tuple(row) for row in result.all()]


async def ledger_rows(db: AsyncSession, *, start: datetime, end: datetime) -> list[tuple]:
    """Every non-internal order created in [start, end): (Invoice, first, last, account_code,
    acquisition_channel) for the BR-106 ledger."""
    result = await db.execute(
        select(
            Invoice, User.first_name, User.last_name, User.account_code, User.acquisition_channel
        )
        .join(User, User.id == Invoice.user_id)
        .where(
            User.is_internal.is_(False),
            Invoice.created_at >= start,
            Invoice.created_at < end,
            Invoice.status != "pending",
        )
        .order_by(Invoice.created_at)
    )
    return [tuple(row) for row in result.all()]


async def user_ids_with_saved_design(db: AsyncSession) -> set:
    result = await db.execute(
        select(Project.user_id).where(Project.design_config.is_not(None)).distinct()
    )
    return set(result.scalars())
