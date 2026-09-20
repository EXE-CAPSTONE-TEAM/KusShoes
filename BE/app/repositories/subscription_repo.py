import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.subscription import Subscription
from app.models.user import User


async def create_free(db: AsyncSession, *, user_id: uuid.UUID, plan_id: uuid.UUID) -> Subscription:
    sub = Subscription(user_id=user_id, plan_id=plan_id, tier="free", status="active")
    db.add(sub)
    await db.flush()
    return sub


async def get_by_user(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    result = await db.execute(
        select(Subscription)
        .options(joinedload(Subscription.plan))
        .where(Subscription.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def upsert_after_payment(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    tier: str,
    status: str,
    expires_at: datetime | None,
    current_period_start: datetime,
    cancel_at_period_end: bool = False,
    last_invoice_id: uuid.UUID | None = None,
) -> Subscription:
    """Always an UPDATE — every user has exactly one subscription row, created at registration."""
    subscription = await get_by_user(db, user_id)
    subscription.plan_id = plan_id
    subscription.tier = tier
    subscription.status = status
    subscription.expires_at = expires_at
    subscription.grace_until = None
    subscription.is_comp = False
    subscription.current_period_start = current_period_start
    subscription.cancel_at_period_end = cancel_at_period_end
    if last_invoice_id is not None:
        subscription.last_invoice_id = last_invoice_id
    await db.flush()
    return subscription


async def list_all(
    db: AsyncSession,
    *,
    tier: str | None = None,
    status: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[Subscription, str | None]]:
    query = (
        select(Subscription, User.email)
        .outerjoin(User, User.id == Subscription.user_id)
        .options(joinedload(Subscription.plan))
    )
    if tier is not None:
        query = query.where(Subscription.tier == tier)
    if status is not None:
        query = query.where(Subscription.status == status)
    if before is not None:
        if before_id is not None:
            query = query.where((Subscription.started_at < before) | ((Subscription.started_at == before) & (Subscription.id < before_id)))
        else:
            query = query.where(Subscription.started_at < before)
    query = query.order_by(Subscription.started_at.desc(), Subscription.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(subscription, user_email) for subscription, user_email in result.all()]
