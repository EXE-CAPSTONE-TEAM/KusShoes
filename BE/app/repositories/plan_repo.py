import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan


async def get_free_plan(db: AsyncSession) -> Plan | None:
    result = await db.execute(
        select(Plan).where(Plan.tier == "free", Plan.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, plan_id: uuid.UUID) -> Plan | None:
    return await db.get(Plan, plan_id)


async def get_by_tier_and_cycle(
    db: AsyncSession, tier: str, billing_cycle: str | None
) -> Plan | None:
    result = await db.execute(
        select(Plan).where(
            Plan.tier == tier,
            Plan.billing_cycle == billing_cycle,
            Plan.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def get_by_polar_product_id(db: AsyncSession, polar_product_id: str) -> Plan | None:
    result = await db.execute(
        select(Plan).where(Plan.polar_product_id == polar_product_id)
    )
    return result.scalar_one_or_none()


async def list_active(db: AsyncSession) -> list[Plan]:
    result = await db.execute(select(Plan).where(Plan.is_active.is_(True)))
    return list(result.scalars())


async def list_all(db: AsyncSession) -> list[Plan]:
    """Kể cả inactive — cho admin."""
    result = await db.execute(
        select(Plan).order_by(Plan.tier, Plan.billing_cycle.nulls_first())
    )
    return list(result.scalars())


async def update_fields(db: AsyncSession, plan: Plan, changes: dict) -> Plan:
    for field, value in changes.items():
        setattr(plan, field, value)
    await db.flush()
    return plan
