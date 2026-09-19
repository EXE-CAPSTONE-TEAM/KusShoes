import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent_record import ConsentRecord


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: str,
    doc_version: str,
    channel: str = "web",
) -> ConsentRecord:
    record = ConsentRecord(user_id=user_id, type=type, doc_version=doc_version, channel=channel)
    db.add(record)
    await db.flush()
    return record


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[ConsentRecord]:
    result = await db.execute(
        select(ConsentRecord)
        .where(ConsentRecord.user_id == user_id)
        .order_by(ConsentRecord.created_at.desc())
    )
    return list(result.scalars())


async def get_active(db: AsyncSession, user_id: uuid.UUID, type: str) -> ConsentRecord | None:
    result = await db.execute(
        select(ConsentRecord)
        .where(
            ConsentRecord.user_id == user_id,
            ConsentRecord.type == type,
            ConsentRecord.revoked_at.is_(None),
        )
        .order_by(ConsentRecord.created_at.desc())
    )
    return result.scalars().first()


async def revoke(db: AsyncSession, record: ConsentRecord) -> None:
    record.revoked_at = datetime.now(UTC)
    await db.flush()
