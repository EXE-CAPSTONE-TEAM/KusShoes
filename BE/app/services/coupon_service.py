"""BR-26 promo codes (and BR-91 Early Bird, configured as a first-payment-only coupon)."""
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import CouponInvalid
from app.models.coupon import Coupon
from app.models.plan import Plan
from app.repositories import coupon_repo, invoice_repo
from app.services.audit import record_audit

MIN_CHARGE_VND = 1000  # gateways reject 0đ; BR-26 only requires price >= 0


async def evaluate(
    db: AsyncSession, user, code: str, plan: Plan, price_vnd: int
) -> tuple[Coupon, int]:
    """Returns (coupon, discount_vnd). Raises CouponInvalid (MSG27) for every failure."""
    coupon = await coupon_repo.get_by_code(db, code)
    if not coupon or not coupon.is_active:
        raise CouponInvalid()
    now = datetime.now(UTC)
    if coupon.valid_from and coupon.valid_from > now:
        raise CouponInvalid()
    if coupon.valid_until and coupon.valid_until < now:
        raise CouponInvalid()
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise CouponInvalid()
    if coupon.plan_tiers and plan.tier not in coupon.plan_tiers:
        raise CouponInvalid()
    if await coupon_repo.has_redeemed(db, coupon.id, user.id):
        raise CouponInvalid()
    if coupon.first_payment_only and await invoice_repo.has_paid_invoice(db, user.id):
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


async def redeem(db: AsyncSession, invoice) -> None:
    if not invoice.coupon_code:
        return
    coupon = await coupon_repo.get_by_code(db, invoice.coupon_code)
    if coupon:
        await coupon_repo.record_redemption(db, coupon, invoice.user_id, invoice.id)


# --- admin management (UC-23) ---


async def list_coupons(db: AsyncSession) -> list[Coupon]:
    return await coupon_repo.list_all(db)


async def create_coupon(db: AsyncSession, admin, fields: dict) -> Coupon:
    fields["code"] = fields["code"].strip().upper()
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
    await coupon_repo.update_fields(db, coupon, changes)
    await record_audit(
        db, admin, "coupon.update", target_type="coupon", target_id=coupon.id,
        payload={k: str(v) for k, v in changes.items()},
    )
    await db.commit()
    return coupon
