import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.export_record import ExportRecord
from app.models.project import Project
from app.models.project_asset import ProjectAsset
from app.models.subscription import Subscription
from app.models.user import User

GRACE_PERIOD = timedelta(days=3)


async def list_project_file_paths(db: AsyncSession, project_id: uuid.UUID) -> list[str]:
    asset_result = await db.execute(
        select(ProjectAsset.file_path).where(ProjectAsset.project_id == project_id)
    )
    export_result = await db.execute(
        select(ExportRecord.file_path).where(ExportRecord.project_id == project_id)
    )
    project = await db.get(Project, project_id)
    paths = list(asset_result.scalars()) + list(export_result.scalars())
    if project and project.thumbnail_path:
        paths.append(project.thumbnail_path)
    return paths


async def list_user_file_paths(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    project_ids = select(Project.id).where(Project.user_id == user_id)
    asset_result = await db.execute(
        select(ProjectAsset.file_path).where(ProjectAsset.project_id.in_(project_ids))
    )
    export_result = await db.execute(
        select(ExportRecord.file_path).where(ExportRecord.user_id == user_id)
    )
    user = await db.get(User, user_id)
    paths = list(asset_result.scalars()) + list(export_result.scalars())
    if user and user.avatar_path:
        paths.append(user.avatar_path)
    return paths


async def list_subscriptions_entering_grace(
    db: AsyncSession, *, at: datetime
) -> list[Subscription]:
    """BR-90: paid subscriptions whose cycle just ended — move to GRACE
    instead of downgrading immediately."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.status == "active",
            Subscription.tier != "free",
            Subscription.expires_at.is_not(None),
            Subscription.expires_at <= at,
        )
    )
    return list(result.scalars())


async def enter_grace(
    db: AsyncSession, subscriptions: list[Subscription], *, at: datetime
) -> None:
    for subscription in subscriptions:
        subscription.status = "grace"
        subscription.grace_until = at + GRACE_PERIOD
    await db.flush()


async def list_grace_expired(db: AsyncSession, *, at: datetime) -> list[Subscription]:
    result = await db.execute(
        select(Subscription).where(
            Subscription.status == "grace",
            Subscription.grace_until.is_not(None),
            Subscription.grace_until <= at,
        )
    )
    return list(result.scalars())


async def list_expiring_for_reminder(
    db: AsyncSession, *, window_start: datetime, window_end: datetime
) -> list[tuple[Subscription, str]]:
    """SF-17: active paid subscriptions expiring within [window_start, window_end),
    joined with the owner's email for the reminder."""
    result = await db.execute(
        select(Subscription, User.email)
        .join(User, User.id == Subscription.user_id)
        .where(
            Subscription.status == "active",
            Subscription.tier != "free",
            Subscription.expires_at.is_not(None),
            Subscription.expires_at >= window_start,
            Subscription.expires_at < window_end,
        )
    )
    return [(sub, email) for sub, email in result.all()]


async def downgrade_to_free(
    db: AsyncSession,
    subscriptions: list[Subscription],
    *,
    free_plan_id: uuid.UUID,
    at: datetime,
) -> None:
    for subscription in subscriptions:
        subscription.plan_id = free_plan_id
        subscription.tier = "free"
        subscription.status = "active"
        subscription.expires_at = None
        subscription.grace_until = None
        subscription.cancel_at_period_end = False
        subscription.current_period_start = at
    await db.flush()


async def delete_stale_uploads(db: AsyncSession, *, before: datetime) -> list[str]:
    cutoff = before.replace(tzinfo=None) if before.tzinfo is not None else before
    result = await db.execute(
        select(ProjectAsset).where(
            ProjectAsset.status == "uploading",
            ProjectAsset.created_at < cutoff,
        )
    )
    assets = list(result.scalars())
    paths = [asset.file_path for asset in assets]
    if assets:
        await db.execute(delete(ProjectAsset).where(ProjectAsset.id.in_([a.id for a in assets])))
    return paths


async def list_project_ids_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(select(Project.id).where(Project.user_id == user_id))
    return list(result.scalars())
