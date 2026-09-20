import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import Feedback
from app.models.user import User


async def create(db: AsyncSession, **fields) -> Feedback:
    feedback = Feedback(**fields)
    db.add(feedback)
    await db.flush()
    return feedback


async def get_by_id(db: AsyncSession, feedback_id: uuid.UUID) -> Feedback | None:
    return await db.get(Feedback, feedback_id)


async def latest_for_user(db: AsyncSession, user_id: uuid.UUID) -> Feedback | None:
    result = await db.execute(
        select(Feedback)
        .where(Feedback.user_id == user_id)
        .order_by(Feedback.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[Feedback]:
    result = await db.execute(
        select(Feedback).where(Feedback.user_id == user_id).order_by(Feedback.created_at.desc())
    )
    return list(result.scalars())


def _filtered(
    *,
    status: str | None,
    marketing_group: str | None,
    rating: int | None,
    include_internal: bool,
    since: datetime | None,
):
    query = select(Feedback, User.email).outerjoin(User, User.id == Feedback.user_id)
    if status is not None:
        query = query.where(Feedback.status == status)
    if marketing_group is not None:
        query = query.where(Feedback.marketing_group == marketing_group)
    if rating is not None:
        query = query.where(Feedback.rating == rating)
    if not include_internal:
        query = query.where(Feedback.is_internal.is_(False))
    if since is not None:
        query = query.where(Feedback.created_at >= since)
    return query


async def list_admin(
    db: AsyncSession,
    *,
    status: str | None = None,
    marketing_group: str | None = None,
    rating: int | None = None,
    include_internal: bool = False,
    since: datetime | None = None,
    limit: int = 500,
) -> list[tuple[Feedback, str | None]]:
    query = _filtered(
        status=status,
        marketing_group=marketing_group,
        rating=rating,
        include_internal=include_internal,
        since=since,
    )
    result = await db.execute(query.order_by(Feedback.created_at.desc()).limit(limit))
    return [(row[0], row[1]) for row in result.all()]


async def rating_summary(db: AsyncSession) -> dict:
    """Internal accounts never count toward customer sentiment."""
    result = await db.execute(
        select(func.count(Feedback.id), func.coalesce(func.avg(Feedback.rating), 0)).where(
            Feedback.is_internal.is_(False)
        )
    )
    count, average = result.one()
    by_status = await db.execute(
        select(Feedback.status, func.count(Feedback.id))
        .where(Feedback.is_internal.is_(False))
        .group_by(Feedback.status)
    )
    by_group = await db.execute(
        select(Feedback.marketing_group, func.count(Feedback.id))
        .where(Feedback.is_internal.is_(False))
        .group_by(Feedback.marketing_group)
    )
    return {
        "count": int(count),
        "average_rating": round(float(average), 2),
        "by_status": {row[0]: int(row[1]) for row in by_status.all()},
        "by_group": {row[0]: int(row[1]) for row in by_group.all()},
    }
