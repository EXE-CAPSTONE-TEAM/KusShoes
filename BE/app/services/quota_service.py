"""BR-23: cycle-anchored quota bookkeeping.

Free tier quota resets on a rolling ~30-day window anchored to the account's
own registration date, computed on the fly. Paid tiers only move their anchor
forward when a payment activates/renews the subscription (billing_service) —
between payments, the anchor stays fixed so quota isn't reset without paying.

Scans (BR-23, SRS_v2.2.txt:1561 "Thứ tự trừ: lượt của gói trước, Credit sau"):
- `assert_scan_available` is the non-mutating intake gate the scan-job entry point calls
  before accepting a job (mobile_service.bootstrap_scan). It refuses GRACE accounts first
  (BR-90, SRS_v2.2.txt:1582 "không quét"), then accounts with no plan scan and no Credit;
- `consume_scan` performs the deduction - plan scans of the current cycle first, then the
  oldest-expiring spendable Credit (BR-94, SRS_v2.2.txt:1617) - and is exposed to the scan
  service as POST /api/v1/internal/scan-quota/consume.
Credits live in `scan_credits` and are never touched by a cycle reset (SRS_v2.2.txt:2856).
"""
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ScanQuotaExhausted, SubGracePeriodScanBlocked, SubNotFound
from app.models.monthly_usage import MonthlyUsage
from app.models.subscription import Subscription
from app.repositories import (
    monthly_usage_repo,
    scan_credit_repo,
    subscription_repo,
    user_repo,
)

_PERIOD_LENGTH = timedelta(days=30)


def current_period_start(
    subscription: Subscription | None, *, now: datetime | None = None
) -> datetime:
    now = now or datetime.now(UTC)
    if subscription is None:
        return now
    anchor = subscription.current_period_start
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=UTC)
    if subscription.tier != "free":
        return anchor
    elapsed = now - anchor
    if elapsed < _PERIOD_LENGTH:
        return anchor
    periods_passed = elapsed // _PERIOD_LENGTH
    return anchor + periods_passed * _PERIOD_LENGTH


async def get_usage(
    db: AsyncSession,
    user_id: uuid.UUID,
    subscription: Subscription | None,
    *,
    for_update: bool = False,
) -> MonthlyUsage:
    return await monthly_usage_repo.get_or_create_period(
        db, user_id, current_period_start(subscription), for_update=for_update
    )


async def increment_projects(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None, delta: int
) -> None:
    await monthly_usage_repo.increment_projects(
        db, user_id, current_period_start(subscription), delta
    )


async def increment_exports(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None, count: int
) -> None:
    await monthly_usage_repo.increment_exports(
        db, user_id, current_period_start(subscription), count
    )


# --- BR-23 scan quota: plan first, Credit second ---


@dataclass(frozen=True)
class ScanBalance:
    plan_remaining: int
    credit_available: int
    cycle_start: datetime
    resets_at: datetime | None


@dataclass(frozen=True)
class ScanIntakeDecision:
    can_scan: bool
    blocked_code: str | None  # the AppException code the intake gate would raise


@dataclass(frozen=True)
class ScanConsumption:
    source: Literal["plan", "credit"]
    plan_remaining: int
    credit_available: int


def next_period_start(
    subscription: Subscription | None, *, now: datetime | None = None
) -> datetime | None:
    """When the plan-scan counter next resets: Free rolls on its own window; a paid plan's
    next cycle starts at the payment that renews it, i.e. at `expires_at`."""
    if subscription is None:
        return None
    if subscription.tier == "free":
        return current_period_start(subscription, now=now) + _PERIOD_LENGTH
    expires_at = subscription.expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at


def plan_scan_limit(subscription: Subscription | None) -> int:
    """NULL max_scans_per_cycle means 0, not unlimited: every tier has a finite scan quota
    (plan table SRS_v2.2.txt:900-903 - Free 0, Basic 1, Pro 3)."""
    if subscription is None or subscription.plan is None:
        return 0
    return subscription.plan.max_scans_per_cycle or 0


async def scan_balance(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None
) -> ScanBalance:
    """Read-only: neither creates a usage row nor locks anything."""
    now = datetime.now(UTC)
    cycle_start = current_period_start(subscription, now=now)
    usage = await monthly_usage_repo.get_period(db, user_id, cycle_start)
    used = usage.scans_used if usage else 0
    return ScanBalance(
        plan_remaining=max(0, plan_scan_limit(subscription) - used),
        credit_available=await scan_credit_repo.count_spendable(db, user_id, now),
        cycle_start=cycle_start,
        resets_at=next_period_start(subscription, now=now),
    )


def _exhausted(balance: ScanBalance) -> ScanQuotaExhausted:
    return ScanQuotaExhausted(
        resets_at=balance.resets_at.isoformat() if balance.resets_at else None
    )


def _intake_refusal(subscription: Subscription | None, balance: ScanBalance) -> Exception | None:
    """The single rule behind the intake gate and the reported `can_scan` flag.

    GRACE is checked first: BR-90 (SRS_v2.2.txt:1582) - an account in grace may view, edit
    and save but "không quét", even with plan scans or Credits left. Otherwise the account
    needs a plan scan this cycle or a spendable Credit (MSG28, SRS_v2.2.txt:2356)."""
    if subscription is not None and subscription.status == "grace":
        return SubGracePeriodScanBlocked()
    if balance.plan_remaining <= 0 and balance.credit_available <= 0:
        return _exhausted(balance)
    return None


def intake_decision(subscription: Subscription | None, balance: ScanBalance) -> ScanIntakeDecision:
    refusal = _intake_refusal(subscription, balance)
    return ScanIntakeDecision(
        can_scan=refusal is None, blocked_code=refusal.code if refusal else None
    )


async def assert_scan_available(db: AsyncSession, user) -> None:
    """Intake gate, called before a scan job is accepted. Raises SubGracePeriodScanBlocked
    for a GRACE account (BR-90) or ScanQuotaExhausted (MSG28) when nothing is left.
    Non-mutating: it deducts and reserves nothing - `consume_scan` does the deduction."""
    subscription = await subscription_repo.get_by_user(db, user.id)
    balance = await scan_balance(db, user.id, subscription)
    refusal = _intake_refusal(subscription, balance)
    if refusal is not None:
        raise refusal


def reference_key(user_id: uuid.UUID, reference: str) -> str:
    """The value stored in `scan_credits.consumed_ref` for a caller's scan reference.

    Namespaced by user so the globally unique `uq_scan_credits_consumed_ref` can never make
    one user's reference collide with another's. The reference is hashed because the API
    accepts up to 100 characters and the column is String(100): 32 + 1 + 64 = 97 chars."""
    digest = hashlib.sha256(reference.encode("utf-8")).hexdigest()
    return f"{user_id.hex}:{digest}"


async def _replay(
    db: AsyncSession, user_id: uuid.UUID, subscription: Subscription | None, reference: str
) -> ScanConsumption | None:
    prior = await scan_credit_repo.get_by_consumed_ref(
        db, user_id, reference_key(user_id, reference)
    )
    if prior is None:
        return None
    balance = await scan_balance(db, user_id, subscription)
    return ScanConsumption(
        source="credit",
        plan_remaining=balance.plan_remaining,
        credit_available=balance.credit_available,
    )


async def consume_scan(
    db: AsyncSession, user, subscription: Subscription | None, *, reference: str
) -> ScanConsumption:
    """Deduct one scan: plan scans first, then the oldest-expiring spendable Credit
    (BR-23). Flushes; the caller commits.

    Deliberately NO GRACE check here: the BR-90 "không quét" rule is enforced at intake by
    `assert_scan_available`. This is the charge for a scan that was already accepted, and
    it runs when the job completes (mobile_service.confirm_output). A scan accepted before
    the account entered GRACE must still be charged and delivered.

    Idempotency: a Credit consumption is keyed by `reference_key(user, reference)` (unique
    `uq_scan_credits_consumed_ref`); re-posting the same reference returns the prior
    result instead of spending a second Credit. The same reference sent for two different
    users is two different keys, so it can never surface as a unique-index error.
    Plan-side idempotency is the caller's job: it must send a fresh unique reference per
    scan attempt."""
    replay = await _replay(db, user.id, subscription, reference)
    if replay is not None:
        return replay

    now = datetime.now(UTC)
    cycle_start = current_period_start(subscription, now=now)
    usage = await monthly_usage_repo.get_or_create_period(
        db, user.id, cycle_start, for_update=True
    )
    limit = plan_scan_limit(subscription)
    used = usage.scans_used  # read before the UPDATE synchronises the instance
    if used < limit:
        await monthly_usage_repo.increment_scans(db, user.id, cycle_start, 1)
        return ScanConsumption(
            source="plan",
            plan_remaining=limit - used - 1,
            credit_available=await scan_credit_repo.count_spendable(db, user.id, now),
        )

    credit = await scan_credit_repo.pick_oldest_spendable_for_update(db, user.id, now)
    if credit is None:
        raise _exhausted(await scan_balance(db, user.id, subscription))
    try:
        await scan_credit_repo.mark_used(
            db, credit, consumed_at=now, reference=reference_key(user.id, reference)
        )
    except IntegrityError:
        # A concurrent request for the same user and reference won the unique index.
        await db.rollback()
        replay = await _replay(db, user.id, subscription, reference)
        if replay is None:
            raise
        return replay
    return ScanConsumption(
        source="credit",
        plan_remaining=0,
        credit_available=await scan_credit_repo.count_spendable(db, user.id, now),
    )


async def _load_account(db: AsyncSession, user_id: uuid.UUID):
    user = await user_repo.get_by_id(db, user_id)
    subscription = await subscription_repo.get_by_user(db, user_id) if user else None
    if user is None or subscription is None:
        raise SubNotFound()
    return user, subscription


async def consume_scan_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, reference: str
) -> ScanConsumption:
    """Service-token entry point (POST /api/v1/internal/scan-quota/consume). Charges an
    accepted scan; like `consume_scan` it does not re-check GRACE (see there)."""
    user, subscription = await _load_account(db, user_id)
    # On ScanQuotaExhausted nothing was written; get_db rolls the transaction back.
    result = await consume_scan(db, user, subscription, reference=reference)
    await db.commit()
    return result


async def get_scan_status_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[ScanBalance, ScanIntakeDecision]:
    """Service-token read (GET /api/v1/internal/scan-quota/{user_id}): the balance plus the
    intake decision, computed by the same rule as `assert_scan_available`."""
    _user, subscription = await _load_account(db, user_id)
    balance = await scan_balance(db, user_id, subscription)
    return balance, intake_decision(subscription, balance)
