"""SQL for BR-77 / UC-24 content reports and the moderation ladder (SRS_v2.2.txt:2042, :194)."""

import uuid
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_report import ContentReport
from app.models.moderation_action import ModerationAction
from app.models.user import User


async def create_report(db: AsyncSession, **fields) -> ContentReport:
    report = ContentReport(**fields)
    db.add(report)
    await db.flush()
    return report


async def get_report(
    db: AsyncSession, report_id: uuid.UUID, *, for_update: bool = False
) -> ContentReport | None:
    query = select(ContentReport).where(ContentReport.id == report_id)
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_reports(
    db: AsyncSession,
    *,
    status: str | None,
    limit: int,
    cursor: tuple[datetime, uuid.UUID] | None,
) -> list[ContentReport]:
    """Newest first; returns up to limit + 1 rows so the caller can tell whether a next page
    exists."""
    query = select(ContentReport)
    if status is not None:
        query = query.where(ContentReport.status == status)
    if cursor is not None:
        cursor_time, cursor_id = cursor
        query = query.where(
            or_(
                ContentReport.created_at < cursor_time,
                and_(ContentReport.created_at == cursor_time, ContentReport.id < cursor_id),
            )
        )
    result = await db.execute(
        query.order_by(ContentReport.created_at.desc(), ContentReport.id.desc()).limit(limit + 1)
    )
    return list(result.scalars())


async def lock_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Row-locks the reported user so two concurrent upholds cannot both compute the same
    ladder level."""
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    return result.scalar_one_or_none()


async def count_actions(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Number of upheld actions already applied to the user. Only `uphold` writes a
    moderation_actions row, so a dismissed report never counts."""
    result = await db.execute(
        select(func.count(ModerationAction.id)).where(ModerationAction.user_id == user_id)
    )
    return int(result.scalar_one())


async def highest_level(db: AsyncSession, user_id: uuid.UUID) -> int | None:
    result = await db.execute(
        select(func.max(ModerationAction.level)).where(ModerationAction.user_id == user_id)
    )
    return result.scalar_one()


async def create_action(db: AsyncSession, **fields) -> ModerationAction:
    action = ModerationAction(**fields)
    db.add(action)
    await db.flush()
    return action


async def active_restriction(
    db: AsyncSession, user_id: uuid.UUID, *, now: datetime
) -> datetime | None:
    """End of the user's current public-sharing restriction, or None when none is active."""
    result = await db.execute(
        select(func.max(ModerationAction.restricted_until)).where(
            ModerationAction.user_id == user_id,
            ModerationAction.restricted_until > now,
        )
    )
    return result.scalar_one()


async def list_actions_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[ModerationAction, str | None]]:
    """Newest first, each with the status of the report that triggered it."""
    result = await db.execute(
        select(ModerationAction, ContentReport.status)
        .outerjoin(ContentReport, ContentReport.id == ModerationAction.report_id)
        .where(ModerationAction.user_id == user_id)
        .order_by(ModerationAction.created_at.desc(), ModerationAction.id.desc())
    )
    return [(action, status) for action, status in result.all()]
