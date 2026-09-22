"""BR-94 / UC-27 single-scan Credits (SRS_v2.2.txt:1617, :209, :2856; plan table :898, :904).

"Credit 49.000đ = 1 lượt quét bổ sung; chỉ mua được khi đang có gói Basic/Pro còn hiệu lực;
tối đa 3 Credit/chu kỳ; hạn dùng 12 tháng kể từ ngày mua; Credit đã dùng không hoàn."

Price, per-cycle cap and validity come from settings (CREDIT_PRICE_VND,
CREDIT_MAX_PER_CYCLE, CREDIT_VALIDITY_MONTHS). Consumption order (BR-23) lives in
quota_service.consume_scan.
"""
import calendar
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import CreditCycleLimitExceeded, CreditRequiresPaidPlan
from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.models.subscription import Subscription
from app.repositories import scan_credit_repo, subscription_repo
from app.repositories.scan_credit_repo import CREDIT_CYCLE_METADATA_KEY
from app.services import quota_service
from app.utils.pagination import decode_cursor, encode_cursor

# SRS_v2.2.txt:1617 "chỉ mua được khi đang có gói Basic/Pro còn hiệu lực" (plan.tier values).
_CREDIT_ELIGIBLE_PLAN_TIERS = ("basic", "pro")


def add_months(moment: datetime, months: int) -> datetime:
    """Same instant `months` later; the day is clamped to the target month's last day
    (31 Jan -> 28/29 Feb, 29 Feb -> 28 Feb next year). Time of day and tz are kept."""
    index = moment.month - 1 + months
    year, month = moment.year + index // 12, index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def is_credit_invoice(invoice) -> bool:
    return invoice.plan_tier == CREDIT_INVOICE_TIER


def credit_quantity(invoice) -> int:
    return invoice.listed_price_vnd // settings.CREDIT_PRICE_VND


def plan_allows_purchase(subscription: Subscription | None) -> bool:
    """ACTIVE Basic/Pro only. GRACE does not qualify: BR-90 forbids scanning during grace
    (SRS_v2.2.txt:1582 "không quét"), and free/cancelled/expired are not a paid plan."""
    if subscription is None or subscription.status != "active" or subscription.plan is None:
        return False
    return subscription.plan.tier in _CREDIT_ELIGIBLE_PLAN_TIERS


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def cycle_metadata(cycle_start: datetime) -> dict:
    return {CREDIT_CYCLE_METADATA_KEY: _aware(cycle_start).isoformat()}


async def purchased_in_cycle(db: AsyncSession, user_id: uuid.UUID, cycle_start: datetime) -> int:
    """Credits already bought against this cycle plus those on still-pending Credit
    invoices for it, so several open checkouts cannot exceed the cap together."""
    minted = await scan_credit_repo.count_purchased_in_cycle(db, user_id, cycle_start)
    pending_listed = await scan_credit_repo.pending_credit_listed_total(
        db, user_id, _aware(cycle_start).isoformat()
    )
    return minted + pending_listed // settings.CREDIT_PRICE_VND


async def assert_can_purchase(db: AsyncSession, user, quantity: int) -> datetime:
    """Purchase gate + per-cycle cap (MSG51, SRS_v2.2.txt:2494). Locks the subscription
    row so concurrent checkouts are serialised. Returns the cycle anchor the purchase
    counts against."""
    await scan_credit_repo.lock_subscription(db, user.id)
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not plan_allows_purchase(subscription):
        raise CreditRequiresPaidPlan()
    cycle_start = quota_service.current_period_start(subscription)
    purchased = await purchased_in_cycle(db, user.id, cycle_start)
    if purchased + quantity > settings.CREDIT_MAX_PER_CYCLE:
        raise CreditCycleLimitExceeded(purchased=purchased, limit=settings.CREDIT_MAX_PER_CYCLE)
    return cycle_start


async def mint_for_invoice(db: AsyncSession, invoice) -> int:
    """Turn a paid Credit invoice into `quantity` ledger rows. `purchased_at` is the
    payment time and each Credit expires CREDIT_VALIDITY_MONTHS later (SRS_v2.2.txt:1617).
    Never mints twice for the same invoice."""
    if await scan_credit_repo.count_for_invoice(db, invoice.id) > 0:
        return 0
    quantity = credit_quantity(invoice)
    purchased_at = _aware(invoice.paid_at)
    recorded = (invoice.gateway_metadata or {}).get(CREDIT_CYCLE_METADATA_KEY)
    if recorded:
        cycle_start = datetime.fromisoformat(recorded)
    else:
        subscription = await subscription_repo.get_by_user(db, invoice.user_id)
        cycle_start = quota_service.current_period_start(subscription, now=purchased_at)
    await scan_credit_repo.mint(
        db,
        user_id=invoice.user_id,
        invoice_id=invoice.id,
        quantity=quantity,
        purchased_at=purchased_at,
        expires_at=add_months(purchased_at, settings.CREDIT_VALIDITY_MONTHS),
        purchase_cycle_start=cycle_start,
        price_vnd=invoice.listed_price_vnd // quantity,
    )
    return quantity


async def refund_violation(db: AsyncSession, invoice) -> str | None:
    """BR-97 (SRS_v2.2.txt:1680) "chưa dùng lượt quét"; BR-94 "Credit đã dùng không hoàn"."""
    if await scan_credit_repo.count_used_for_invoice(db, invoice.id) > 0:
        return "Credit đã dùng không hoàn"
    return None


async def revoke_for_refund(db: AsyncSession, invoice) -> int:
    """A refunded Credit invoice loses only its still-available Credits; used ones stay used."""
    return await scan_credit_repo.revoke_available_for_invoice(
        db, invoice.id, datetime.now(UTC)
    )


async def get_balance(db: AsyncSession, user) -> dict:
    now = datetime.now(UTC)
    subscription = await subscription_repo.get_by_user(db, user.id)
    cycle_start = quota_service.current_period_start(subscription, now=now)
    counts = await scan_credit_repo.summary(db, user.id, now)
    purchased = await purchased_in_cycle(db, user.id, cycle_start)
    return {
        **counts,
        "purchased_this_cycle": purchased,
        "max_per_cycle": settings.CREDIT_MAX_PER_CYCLE,
        "price_vnd": settings.CREDIT_PRICE_VND,
        "can_purchase": plan_allows_purchase(subscription)
        and purchased < settings.CREDIT_MAX_PER_CYCLE,
        "cycle_start": cycle_start,
    }


async def get_ledger(db: AsyncSession, user, *, limit: int, cursor: str | None) -> dict:
    before = before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
    # One extra row tells us whether another page exists.
    rows = await scan_credit_repo.list_for_user(
        db, user.id, limit=limit + 1, before=before, before_id=before_id
    )
    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = encode_cursor(items[-1].purchased_at, items[-1].id) if has_next else None
    return {"items": items, "next_cursor": next_cursor, "has_next": has_next}


async def expire_due(db: AsyncSession) -> dict:
    """Daily job: flip lapsed `available` Credits to `expired`. Reads already treat a past
    expires_at as unavailable, so this is bookkeeping, not the source of truth."""
    expired = await scan_credit_repo.expire_due(db, datetime.now(UTC))
    await db.commit()
    return {"status": "completed", "expired": expired}
