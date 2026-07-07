import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(token)
    await db.flush()
    return token


async def get_by_hash(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def revoke(db: AsyncSession, token_id: uuid.UUID) -> None:
    result = await db.execute(select(RefreshToken).where(RefreshToken.id == token_id))
    token = result.scalar_one_or_none()
    if token:
        token.revoked_at = datetime.now(UTC)


async def revoke_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def list_active_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[RefreshToken]:
    result = await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(UTC),
        )
        .order_by(RefreshToken.created_at.desc())
    )
    return list(result.scalars())


async def get_active_for_user(
    db: AsyncSession, user_id: uuid.UUID, token_id: uuid.UUID
) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.id == token_id,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    )
    return result.scalar_one_or_none()


async def mark_used(
    db: AsyncSession,
    token: RefreshToken,
    *,
    ip_address: str | None = None,
) -> None:
    token.last_used_at = datetime.now(UTC)
    if ip_address:
        token.ip_address = ip_address
    await db.flush()
