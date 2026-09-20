import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon import Coupon, CouponRedemption


async def get_by_code(db: AsyncSession, code: str) -> Coupon | None:
    result = await db.execute(select(Coupon).where(func.upper(Coupon.code) == code.strip().upper()))
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, coupon_id: uuid.UUID) -> Coupon | None:
    return await db.get(Coupon, coupon_id)


async def list_all(db: AsyncSession) -> list[Coupon]:
    result = await db.execute(select(Coupon).order_by(Coupon.created_at.desc()))
    return list(result.scalars())


async def create(db: AsyncSession, **fields) -> Coupon:
    coupon = Coupon(**fields)
    db.add(coupon)
    await db.flush()
    return coupon


async def update_fields(db: AsyncSession, coupon: Coupon, changes: dict) -> Coupon:
    for field, value in changes.items():
        setattr(coupon, field, value)
    await db.flush()
    return coupon


async def has_redeemed(db: AsyncSession, coupon_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(CouponRedemption.id).where(
            CouponRedemption.coupon_id == coupon_id, CouponRedemption.user_id == user_id
        )
    )
    return result.scalar_one_or_none() is not None


async def record_redemption(
    db: AsyncSession, coupon: Coupon, user_id: uuid.UUID, invoice_id: uuid.UUID
) -> bool:
    """Returns False when this account already redeemed the code (BR-26: 1 use/account)."""
    if await has_redeemed(db, coupon.id, user_id):
        return False
    db.add(CouponRedemption(coupon_id=coupon.id, user_id=user_id, invoice_id=invoice_id))
    coupon.used_count += 1
    await db.flush()
    return True
