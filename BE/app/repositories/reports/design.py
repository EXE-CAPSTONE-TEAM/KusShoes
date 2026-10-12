"""Raw rows for the `thiet-ke-3d` reports. Every query drops internal accounts (BR-83) and caps
at `limit` rows (callers pass `ctx.max_rows + 1` so overflow is detectable)."""

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bake_job import BakeJob
from app.models.export_record import ExportRecord
from app.models.monthly_usage import MonthlyUsage
from app.models.project import Project
from app.models.subscription import Subscription
from app.models.user import User


async def project_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(user_id, created_at, deleted_at, has_design) for projects created OR deleted in [start, end)."""
    result = await db.execute(
        select(
            Project.user_id,
            Project.created_at,
            Project.deleted_at,
            Project.design_config.is_not(None),
        )
        .join(User, User.id == Project.user_id)
        .where(
            User.is_internal.is_(False),
            or_(
                (Project.created_at >= start) & (Project.created_at < end),
                (Project.deleted_at >= start) & (Project.deleted_at < end),
            ),
        )
        .order_by(Project.created_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def bake_job_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(queued_at, kind, priority, status, started_at, completed_at) queued in [start, end)."""
    result = await db.execute(
        select(
            BakeJob.queued_at,
            BakeJob.kind,
            BakeJob.priority,
            BakeJob.status,
            BakeJob.started_at,
            BakeJob.completed_at,
        )
        .join(Project, Project.id == BakeJob.project_id)
        .join(User, User.id == Project.user_id)
        .where(
            User.is_internal.is_(False),
            BakeJob.queued_at >= start,
            BakeJob.queued_at < end,
        )
        .order_by(BakeJob.queued_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def export_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(created_at, format, is_watermarked, file_size_bytes, download_count) in [start, end)."""
    result = await db.execute(
        select(
            ExportRecord.created_at,
            ExportRecord.format,
            ExportRecord.is_watermarked,
            ExportRecord.file_size_bytes,
            ExportRecord.download_count,
        )
        .join(User, User.id == ExportRecord.user_id)
        .where(
            User.is_internal.is_(False),
            ExportRecord.created_at >= start,
            ExportRecord.created_at < end,
        )
        .order_by(ExportRecord.created_at)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]


async def quota_usage_rows(
    db: AsyncSession, *, start: datetime, end: datetime, limit: int
) -> list[tuple]:
    """(period_start, tier, projects_count, exports_count, ai_credits_used, scans_used), one per
    user-cycle whose period_start is in [start, end). No user identifier is returned."""
    result = await db.execute(
        select(
            MonthlyUsage.period_start,
            Subscription.tier,
            MonthlyUsage.projects_count,
            MonthlyUsage.exports_count,
            MonthlyUsage.ai_credits_used,
            MonthlyUsage.scans_used,
        )
        .join(User, User.id == MonthlyUsage.user_id)
        .join(Subscription, Subscription.user_id == MonthlyUsage.user_id)
        .where(
            User.is_internal.is_(False),
            MonthlyUsage.period_start >= start,
            MonthlyUsage.period_start < end,
        )
        .order_by(MonthlyUsage.period_start)
        .limit(limit)
    )
    return [tuple(row) for row in result.all()]
