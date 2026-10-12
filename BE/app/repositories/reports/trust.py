"""Read queries for the `kiem-duyet-bao-mat` report domain. Windows are the half-open
[start_utc, end_utc) pair from ReportContext; the caller passes `max_rows + 1` as `limit` so an
overflow is detectable."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.audit_log import AuditLog
from app.models.content_report import ContentReport
from app.models.feedback import Feedback
from app.models.login_history import LoginHistory
from app.models.moderation_action import ModerationAction
from app.models.user import User


async def feedback_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(created_at, account_code, rating, marketing_group, message, status, changed_what,
    reviewed_at). Internal accounts excluded (BR-83)."""
    stmt = (
        select(
            Feedback.created_at, User.account_code, Feedback.rating, Feedback.marketing_group,
            Feedback.message, Feedback.status, Feedback.changed_what, Feedback.reviewed_at,
        )
        .join(User, User.id == Feedback.user_id)
        .where(
            Feedback.created_at >= start_utc,
            Feedback.created_at < end_utc,
            Feedback.is_internal.is_(False),
            User.is_internal.is_(False),
        )
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]


async def content_report_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(created_at, reason, project_id, template_id, reported account_code, status, reviewed_at,
    resolution_note). The reporter's email/name are deliberately not selected."""
    stmt = (
        select(
            ContentReport.created_at, ContentReport.reason, ContentReport.project_id,
            ContentReport.template_id, User.account_code, ContentReport.status,
            ContentReport.reviewed_at, ContentReport.resolution_note,
        )
        .join(User, User.id == ContentReport.reported_user_id)
        .where(
            ContentReport.created_at >= start_utc,
            ContentReport.created_at < end_utc,
            User.is_internal.is_(False),
        )
        .order_by(ContentReport.created_at.desc())
        .limit(limit)
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]


async def moderation_action_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(created_at, subject account_code, level, action, reason, restricted_until,
    moderator account_code)."""
    moderator = aliased(User)
    stmt = (
        select(
            ModerationAction.created_at, User.account_code, ModerationAction.level,
            ModerationAction.action, ModerationAction.reason,
            ModerationAction.restricted_until, moderator.account_code,
        )
        .join(User, User.id == ModerationAction.user_id)
        .outerjoin(moderator, moderator.id == ModerationAction.created_by)
        .where(
            ModerationAction.created_at >= start_utc,
            ModerationAction.created_at < end_utc,
            User.is_internal.is_(False),
        )
        .order_by(ModerationAction.created_at.desc())
        .limit(limit)
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]


async def audit_log_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(created_at, actor email, actor_role, action, target_type, target_id, payload).
    Not filtered by the internal flag: an audit trail must be complete."""
    stmt = (
        select(
            AuditLog.created_at, User.email, AuditLog.actor_role, AuditLog.action,
            AuditLog.target_type, AuditLog.target_id, AuditLog.payload,
        )
        .join(User, User.id == AuditLog.actor_id)
        .where(AuditLog.created_at >= start_utc, AuditLog.created_at < end_utc)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]


async def login_history_rows(
    db: AsyncSession, start_utc: datetime, end_utc: datetime, limit: int
) -> list[tuple]:
    """(created_at, email_attempted, success, ip_address, user_agent). Complete by design."""
    stmt = (
        select(
            LoginHistory.created_at, LoginHistory.email_attempted, LoginHistory.success,
            LoginHistory.ip_address, LoginHistory.user_agent,
        )
        .where(LoginHistory.created_at >= start_utc, LoginHistory.created_at < end_utc)
        .order_by(LoginHistory.created_at.desc())
        .limit(limit)
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]
