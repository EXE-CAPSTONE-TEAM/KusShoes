import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recovery_code import RecoveryCode


async def replace_all(
    db: AsyncSession, user_id: uuid.UUID, code_hashes: list[str]
) -> list[RecoveryCode]:
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user_id))
    rows = [RecoveryCode(user_id=user_id, code_hash=h) for h in code_hashes]
    db.add_all(rows)
    await db.flush()
    return rows


async def list_unused(db: AsyncSession, user_id: uuid.UUID) -> list[RecoveryCode]:
    result = await db.execute(
        select(RecoveryCode).where(
            RecoveryCode.user_id == user_id, RecoveryCode.used_at.is_(None)
        )
    )
    return list(result.scalars())


async def mark_used(db: AsyncSession, code: RecoveryCode) -> None:
    code.used_at = datetime.now(UTC)
    await db.flush()


async def delete_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user_id))
    await db.flush()
