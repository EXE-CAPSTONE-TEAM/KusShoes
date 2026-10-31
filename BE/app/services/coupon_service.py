"""BR-26 promo codes."""
import uuid
from datetime import UTC, datetime

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AuthRateLimited, CouponInvalid, CouponPlanNotEligible, SubPlanNotFound
from app.infrastructure import rate_limiter
from app.models.coupon import Coupon
from app.models.plan import Plan
from app.repositories import coupon_repo, plan_repo, project_repo, subscription_repo
from app.services.audit import record_audit

MIN_CHARGE_VND = 1000  # gateways reject 0đ; BR-26 only requires price >= 0

GRANT_PLAN = "grant_plan"
GRANT_PLAN_MAX_DAYS = 365  # same ceiling as the admin grant-plan endpoint (GrantCompRequest.days)
GRANT_PLAN_CYCLE = "monthly"  # COMP plans are priced nowhere; the monthly row is the tier carrier
# Same budget as coupon preview: a shared activation code is brute-forceable otherwise.
REDEEM_ATTEMPTS_PER_WINDOW = 10
REDEEM_WINDOW_SECONDS = 60


def _check_usable(coupon: Coupon | None, now: datetime) -> Coupon:
    """Checks shared by checkout discounts and activation codes (everything but plan/user)."""
    if not coupon or not coupon.is_active:
        raise CouponInvalid()
    if coupon.valid_from and coupon.valid_from > now:
        raise CouponInvalid()
    if coupon.valid_until and coupon.valid_until < now:
        raise CouponInvalid()
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise CouponInvalid()
    return coupon


async def evaluate(
    db: AsyncSession, user, code: str, plan: Plan, price_vnd: int
) -> tuple[Coupon, int]:
    """Returns (coupon, discount_vnd). Raises CouponInvalid (MSG27) for every failure."""
    coupon = _check_usable(await coupon_repo.get_by_code(db, code), datetime.now(UTC))
    if coupon.discount_type == GRANT_PLAN:  # activation codes never act as a price discount
        raise CouponInvalid()
    if coupon.plan_tiers and plan.tier not in coupon.plan_tiers:
        raise CouponInvalid()
    if await coupon_repo.has_redeemed(db, coupon.id, user.id):
        raise CouponInvalid()

    if coupon.discount_type == "percent":
        discount = price_vnd * coupon.value // 100
    elif coupon.discount_type == "fixed":
        discount = coupon.value
    else:  # fixed_price: the coupon sets the price
        discount = price_vnd - coupon.value
    discount = min(discount, price_vnd - MIN_CHARGE_VND)
    if discount <= 0:
        raise CouponInvalid()
    return coupon, discount


async def redeem_plan_code(
    db: AsyncSession, user, code: str, *, redis: aioredis.Redis | None = None
) -> dict:
    """Activation code -> COMP plan, no payment. Locks the coupon row so max_uses and
    one-per-account hold when many users redeem at the same moment."""
    if redis is not None:
        retry_after = await rate_limiter.consume(
            redis,
            bucket="coupon-redeem",
            identifier=str(user.id),
            limit=REDEEM_ATTEMPTS_PER_WINDOW,
            window_seconds=REDEEM_WINDOW_SECONDS,
        )
        if retry_after:
            raise AuthRateLimited(retry_after)

    coupon = _check_usable(await coupon_repo.get_by_code_for_update(db, code), datetime.now(UTC))
    if coupon.discount_type != GRANT_PLAN or not coupon.plan_tiers or len(coupon.plan_tiers) != 1:
        raise CouponInvalid()
    if await coupon_repo.has_redeemed(db, coupon.id, user.id):
        raise CouponInvalid()

    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription:
        raise SubPlanNotFound()
    if subscription.tier != "free":
        raise CouponPlanNotEligible()

    tier = coupon.plan_tiers[0]
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, GRANT_PLAN_CYCLE)
    if not plan:
        raise SubPlanNotFound()

    await subscription_repo.apply_comp(
        db, subscription, plan=plan, tier=tier, billing_cycle=GRANT_PLAN_CYCLE, days=coupon.value
    )
    await project_repo.unlock_all_for_user(db, user.id)
    await coupon_repo.record_redemption(db, coupon, user.id, None)
    await record_audit(
        db, user, "coupon.redeem_plan", target_type="coupon", target_id=coupon.id,
        payload={"code": coupon.code, "tier": subscription.tier, "days": coupon.value},
    )
    await db.commit()
    return {"tier": subscription.tier, "expires_at": subscription.expires_at, "days": coupon.value}


async def redeem(db: AsyncSession, invoice) -> None:
    if not invoice.coupon_code:
        return
    coupon = await coupon_repo.get_by_code(db, invoice.coupon_code)
    if coupon:
        await coupon_repo.record_redemption(db, coupon, invoice.user_id, invoice.id)


# --- admin management (UC-23) ---


async def list_coupons(db: AsyncSession) -> list[Coupon]:
    return await coupon_repo.list_all(db)


def _validate_grant_plan(discount_type: str, value: int, plan_tiers, max_uses) -> None:
    """An activation code grants real access for free, so it must be bounded."""
    if discount_type != GRANT_PLAN:
        return
    if not plan_tiers or len(plan_tiers) != 1 or max_uses is None:
        raise CouponInvalid()
    if not 1 <= value <= GRANT_PLAN_MAX_DAYS:
        raise CouponInvalid()


async def create_coupon(db: AsyncSession, admin, fields: dict) -> Coupon:
    fields["code"] = fields["code"].strip().upper()
    _validate_grant_plan(
        fields["discount_type"], fields["value"], fields.get("plan_tiers"), fields.get("max_uses")
    )
    if await coupon_repo.get_by_code(db, fields["code"]):
        raise CouponInvalid()
    coupon = await coupon_repo.create(db, **fields)
    await record_audit(
        db, admin, "coupon.create", target_type="coupon", target_id=coupon.id,
        payload={"code": coupon.code, "type": coupon.discount_type, "value": coupon.value},
    )
    await db.commit()
    return coupon


async def update_coupon(db: AsyncSession, admin, coupon_id: uuid.UUID, changes: dict) -> Coupon:
    coupon = await coupon_repo.get_by_id(db, coupon_id)
    if not coupon:
        raise CouponInvalid()
    _validate_grant_plan(
        coupon.discount_type,
        changes.get("value", coupon.value),
        changes.get("plan_tiers", coupon.plan_tiers),
        changes.get("max_uses", coupon.max_uses),
    )
    await coupon_repo.update_fields(db, coupon, changes)
    await record_audit(
        db, admin, "coupon.update", target_type="coupon", target_id=coupon.id,
        payload={k: str(v) for k, v in changes.items()},
    )
    await db.commit()
    return coupon
