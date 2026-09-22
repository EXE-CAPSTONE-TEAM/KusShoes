"""All SQL for the BR-94 scan Credit ledger (SRS_v2.2.txt:1617).

"Spendable" always means `status='available' AND expires_at > now`, so behaviour never
depends on the daily expiry job having run."""
import uuid
from datetime import datetime

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.scan_credit import (
    CREDIT_INVOICE_TIER,
    CREDIT_STATUS_AVAILABLE,
    CREDIT_STATUS_EXPIRED,
    CREDIT_STATUS_REVOKED,
    CREDIT_STATUS_USED,
    ScanCredit,
)
from app.models.subscription import Subscription

# Key under invoices.gateway_metadata recording which billing cycle a pending Credit
# checkout counts against (BR-94 "tối đa 3 Credit/chu kỳ").
CREDIT_CYCLE_METADATA_KEY = "credit_cycle_start"


def _spendable(now: datetime):
    return (ScanCredit.status == CREDIT_STATUS_AVAILABLE) & (ScanCredit.expires_at > now)


async def lock_subscription(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Row-lock the user's subscription so concurrent Credit checkouts serialise on the
    per-cycle cap instead of both reading the same count."""
    await db.execute(
        select(Subscription.id).where(Subscription.user_id == user_id).with_for_update()
    )


async def mint(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    invoice_id: uuid.UUID,
    quantity: int,
    purchased_at: datetime,
    expires_at: datetime,
    purchase_cycle_start: datetime,
    price_vnd: int,
) -> list[ScanCredit]:
    credits = [
        ScanCredit(
            user_id=user_id,
            invoice_id=invoice_id,
            purchased_at=purchased_at,
            expires_at=expires_at,
            purchase_cycle_start=purchase_cycle_start,
            price_vnd=price_vnd,
            status=CREDIT_STATUS_AVAILABLE,
        )
        for _ in range(quantity)
    ]
    db.add_all(credits)
    await db.flush()
    return credits


async def count_for_invoice(db: AsyncSession, invoice_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ScanCredit).where(ScanCredit.invoice_id == invoice_id)
    )
    return int(result.scalar_one())


async def count_purchased_in_cycle(
    db: AsyncSession, user_id: uuid.UUID, cycle_start: datetime
) -> int:
    """Credits bought against this cycle anchor. Revoked (refunded) ones are not a purchase."""
    result = await db.execute(
        select(func.count())
        .select_from(ScanCredit)
        .where(
            ScanCredit.user_id == user_id,
            ScanCredit.purchase_cycle_start == cycle_start,
            ScanCredit.status != CREDIT_STATUS_REVOKED,
        )
    )
    return int(result.scalar_one())


async def pending_credit_listed_total(
    db: AsyncSession, user_id: uuid.UUID, cycle_start_iso: str
) -> int:
    """Sum of listed_price_vnd over still-pending Credit invoices opened for this cycle."""
    result = await db.execute(
        select(func.coalesce(func.sum(Invoice.listed_price_vnd), 0)).where(
            Invoice.user_id == user_id,
            Invoice.status == "pending",
            Invoice.plan_tier == CREDIT_INVOICE_TIER,
            Invoice.gateway_metadata[CREDIT_CYCLE_METADATA_KEY].astext == cycle_start_iso,
        )
    )
    return int(result.scalar_one())


async def count_spendable(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(ScanCredit)
        .where(ScanCredit.user_id == user_id, _spendable(now))
    )
    return int(result.scalar_one())


async def summary(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> dict:
    """available / used / expired counts (an `available` row past expires_at counts as
    expired) plus the earliest expiry among spendable credits."""
    lapsed = or_(
        ScanCredit.status == CREDIT_STATUS_EXPIRED,
        (ScanCredit.status == CREDIT_STATUS_AVAILABLE) & (ScanCredit.expires_at <= now),
    )
    result = await db.execute(
        select(
            func.count().filter(_spendable(now)),
            func.count().filter(ScanCredit.status == CREDIT_STATUS_USED),
            func.count().filter(lapsed),
            func.min(ScanCredit.expires_at).filter(_spendable(now)),
        ).where(ScanCredit.user_id == user_id)
    )
    available, used, expired, next_expires_at = result.one()
    return {
        "available": int(available),
        "used": int(used),
        "expired": int(expired),
        "next_expires_at": next_expires_at,
    }


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[ScanCredit]:
    query = select(ScanCredit).where(ScanCredit.user_id == user_id)
    if before is not None and before_id is not None:
        query = query.where(
            (ScanCredit.purchased_at < before)
            | ((ScanCredit.purchased_at == before) & (ScanCredit.id < before_id))
        )
    query = query.order_by(ScanCredit.purchased_at.desc(), ScanCredit.id.desc()).limit(limit)
    result = await db.execute(query.execution_options(populate_existing=True))
    return list(result.scalars())


async def get_by_consumed_ref(
    db: AsyncSession, user_id: uuid.UUID, reference: str
) -> ScanCredit | None:
    result = await db.execute(
        select(ScanCredit)
        .where(ScanCredit.user_id == user_id, ScanCredit.consumed_ref == reference)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def pick_oldest_spendable_for_update(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> ScanCredit | None:
    """BR-23 FIFO by expiry; SKIP LOCKED so two concurrent scans never take the same row."""
    result = await db.execute(
        select(ScanCredit)
        .where(ScanCredit.user_id == user_id, _spendable(now))
        .order_by(ScanCredit.expires_at.asc(), ScanCredit.purchased_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def mark_used(
    db: AsyncSession, credit: ScanCredit, *, consumed_at: datetime, reference: str
) -> ScanCredit:
    credit.status = CREDIT_STATUS_USED
    credit.consumed_at = consumed_at
    credit.consumed_ref = reference
    await db.flush()
    return credit


async def expire_due(db: AsyncSession, now: datetime) -> int:
    result = await db.execute(
        update(ScanCredit)
        .where(ScanCredit.status == CREDIT_STATUS_AVAILABLE, ScanCredit.expires_at <= now)
        .values(status=CREDIT_STATUS_EXPIRED, updated_at=now)
    )
    return int(result.rowcount or 0)


async def count_used_for_invoice(db: AsyncSession, invoice_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(ScanCredit)
        .where(ScanCredit.invoice_id == invoice_id, ScanCredit.status == CREDIT_STATUS_USED)
    )
    return int(result.scalar_one())


async def revoke_available_for_invoice(
    db: AsyncSession, invoice_id: uuid.UUID, now: datetime
) -> int:
    """Refund path: only still-available credits are revoked; used ones stay used."""
    result = await db.execute(
        update(ScanCredit)
        .where(
            ScanCredit.invoice_id == invoice_id,
            ScanCredit.status == CREDIT_STATUS_AVAILABLE,
        )
        .values(status=CREDIT_STATUS_REVOKED, updated_at=now)
    )
    return int(result.rowcount or 0)
