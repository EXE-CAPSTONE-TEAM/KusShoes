import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.login_history import LoginHistory

RETENTION_DAYS = 90


async def record(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    email_attempted: str,
    success: bool,
    ip_address: str | None,
    user_agent: str | None,
) -> LoginHistory:
    entry = LoginHistory(
        user_id=user_id,
        email_attempted=email_attempted,
        success=success,
        ip_address=ip_address,
        user_agent=user_agent[:1000] if user_agent else None,
    )
    db.add(entry)
    await db.flush()
    return entry


async def has_prior_successful_login(
    db: AsyncSession, user_id: uuid.UUID, *, ip_address: str | None, user_agent: str | None
) -> bool:
    """BR-14: has this (ip, user_agent) combo logged in successfully before?"""
    if not ip_address and not user_agent:
        return True  # nothing to fingerprint on — don't false-positive "new device"
    query = select(LoginHistory.id).where(
        LoginHistory.user_id == user_id, LoginHistory.success.is_(True)
    )
    if ip_address:
        query = query.where(LoginHistory.ip_address == ip_address)
    if user_agent:
        query = query.where(LoginHistory.user_agent == user_agent[:1000])
    query = query.limit(1)
    result = await db.execute(query)
    return result.scalar_one_or_none() is not None


async def list_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int = 50
) -> list[LoginHistory]:
    result = await db.execute(
        select(LoginHistory)
        .where(LoginHistory.user_id == user_id)
        .order_by(LoginHistory.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


async def delete_older_than(db: AsyncSession, *, days: int = RETENTION_DAYS) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    result = await db.execute(delete(LoginHistory).where(LoginHistory.created_at < cutoff))
    await db.flush()
    return result.rowcount or 0
