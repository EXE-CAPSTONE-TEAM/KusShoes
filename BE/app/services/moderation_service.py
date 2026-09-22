"""BR-77 content-violation ladder and UC-24 copyright-complaint handling.

- BR-77 (SRS_v2.2.txt:2042): "Xử lý vi phạm nội dung 3 mức: cảnh cáo → hạn chế chia sẻ công
  khai 30 ngày → khoá tài khoản."
- UC-24 (SRS_v2.2.txt:194): Admin "xử lý báo cáo vi phạm bản quyền".
- BR-78 (SRS_v2.2.txt:2048): admin access prompted by a complaint is written to AUDIT_LOG, so
  every uphold/dismiss is audited through app.services.audit.

The level-2 restriction is enforced in app.services.artisan_service (the only public-sharing
surface): new/renewed links are refused and existing links answer the uniform MSG48 410.
"""

import uuid
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    AdminUserNotFound,
    AuthRateLimited,
    ContentReportAlreadyResolved,
    ContentReportNotFound,
    ContentReportTargetInvalid,
    ModerationTargetProtected,
)
from app.infrastructure import rate_limiter
from app.repositories import design_template_repo, moderation_repo, project_repo, user_repo
from app.schemas.admin import CursorPage
from app.schemas.moderation import (
    ContentReportAccepted,
    ContentReportCreate,
    ContentReportDetail,
    ContentReportListItem,
    ModerationActionResponse,
    ModerationDecision,
    MyModerationStatus,
)
from app.services.audit import record_audit
from app.utils.pagination import decode_cursor, encode_cursor

# BR-77 ladder, in order: level N applies _LADDER[N - 1]. Never skipped, never reversed; once
# at the top rung every further upheld report re-applies it.
_LADDER = ("warning", "share_restriction", "ban")
_RESTRICTION_ACTION = "share_restriction"
_BAN_ACTION = "ban"
_SUSPENDED_STATUS = "suspended"  # users.status value set by a ban (ck_users_status)
_OPEN_STATUSES = ("new", "reviewing")
_REPORT_RATE_BUCKET = "content-report"


# --- Public intake (no auth) ----------------------------------------------------------


async def submit_report(
    db: AsyncSession, redis: aioredis.Redis, body: ContentReportCreate, client_ip: str
) -> ContentReportAccepted:
    retry_after = await rate_limiter.consume(
        redis,
        bucket=_REPORT_RATE_BUCKET,
        identifier=client_ip,
        limit=settings.MODERATION_REPORT_RATE_LIMIT,
        window_seconds=settings.MODERATION_REPORT_RATE_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise AuthRateLimited(retry_after)

    reported_user_id = await _resolve_target_owner(db, body)
    report = await moderation_repo.create_report(
        db,
        project_id=body.project_id,
        template_id=body.template_id,
        reported_user_id=reported_user_id,
        reporter_email=body.reporter_email,
        reporter_name=body.reporter_name,
        reason=body.reason,
        details=body.details.strip(),
        evidence_url=body.evidence_url,
    )
    await db.commit()
    return ContentReportAccepted(report_id=report.id, status=report.status)


async def _resolve_target_owner(db: AsyncSession, body: ContentReportCreate) -> uuid.UUID:
    """Exactly one existing target; its owner is resolved here, never taken from the caller."""
    if (body.project_id is None) == (body.template_id is None):
        raise ContentReportTargetInvalid()
    if body.project_id is not None:
        project = await project_repo.get_by_id(db, body.project_id)
        if project is None:
            raise ContentReportTargetInvalid()
        return project.user_id
    template = await design_template_repo.get_by_id(db, body.template_id)
    if template is None or template.created_by is None:
        raise ContentReportTargetInvalid()
    return template.created_by


# --- Customer --------------------------------------------------------------------------


async def my_status(db: AsyncSession, user) -> MyModerationStatus:
    restricted_until = await moderation_repo.active_restriction(
        db, user.id, now=datetime.now(UTC)
    )
    return MyModerationStatus(
        level=await moderation_repo.highest_level(db, user.id) or 0,
        is_restricted=restricted_until is not None,
        restricted_until=restricted_until,
        is_banned=user.status == _SUSPENDED_STATUS,
    )


# --- Admin triage ----------------------------------------------------------------------


async def list_reports(
    db: AsyncSession, *, status: str | None, limit: int, cursor: str | None
) -> CursorPage[ContentReportListItem]:
    rows = await moderation_repo.list_reports(
        db, status=status, limit=limit, cursor=decode_cursor(cursor) if cursor else None
    )
    page = rows[:limit]
    next_cursor = (
        encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit and page else None
    )
    return CursorPage[ContentReportListItem](
        items=[_to_list_item(report) for report in page], next_cursor=next_cursor
    )


async def get_report(db: AsyncSession, report_id: uuid.UUID) -> ContentReportDetail:
    report = await moderation_repo.get_report(db, report_id)
    if report is None:
        raise ContentReportNotFound()
    return await _to_detail(db, report)


async def uphold(
    db: AsyncSession, admin, report_id: uuid.UUID, body: ModerationDecision
) -> ModerationActionResponse:
    report = await _open_report_for_update(db, report_id)
    target = await moderation_repo.lock_user(db, report.reported_user_id)
    if target is None:
        raise AdminUserNotFound()
    _require_moderatable_target(target)

    prior = await moderation_repo.count_actions(db, target.id)
    level = min(prior + 1, len(_LADDER))
    action_kind = _LADDER[level - 1]
    now = datetime.now(UTC)
    restricted_until = (
        now + timedelta(days=settings.MODERATION_SHARE_RESTRICTION_DAYS)
        if action_kind == _RESTRICTION_ACTION
        else None
    )
    action = await moderation_repo.create_action(
        db,
        user_id=target.id,
        report_id=report.id,
        level=level,
        action=action_kind,
        reason=body.resolution_note.strip(),
        restricted_until=restricted_until,
        created_by=admin.id,
    )
    if action_kind == _BAN_ACTION:
        await user_repo.set_status(db, target, _SUSPENDED_STATUS)

    _close(report, admin, "upheld", body, now)
    await record_audit(
        db, admin, "content_report.uphold", target_type="content_report", target_id=report.id,
        payload={
            "user_id": str(target.id),
            "level": level,
            "action": action_kind,
            "restricted_until": restricted_until.isoformat() if restricted_until else None,
        },
    )
    await db.commit()
    return _to_action_response(action, report.status)


async def dismiss(
    db: AsyncSession, admin, report_id: uuid.UUID, body: ModerationDecision
) -> ContentReportDetail:
    """Closes the complaint without applying anything, so the ladder does not advance."""
    report = await _open_report_for_update(db, report_id)
    _close(report, admin, "dismissed", body, datetime.now(UTC))
    await record_audit(
        db, admin, "content_report.dismiss", target_type="content_report", target_id=report.id,
        payload={"user_id": str(report.reported_user_id)},
    )
    await db.commit()
    return await _to_detail(db, report)


async def list_user_actions(
    db: AsyncSession, user_id: uuid.UUID
) -> list[ModerationActionResponse]:
    if await user_repo.get_by_id_any(db, user_id) is None:
        raise AdminUserNotFound()
    return [
        _to_action_response(action, report_status)
        for action, report_status in await moderation_repo.list_actions_for_user(db, user_id)
    ]


# --- Helpers ---------------------------------------------------------------------------


async def _open_report_for_update(db: AsyncSession, report_id: uuid.UUID):
    report = await moderation_repo.get_report(db, report_id, for_update=True)
    if report is None:
        raise ContentReportNotFound()
    if report.status not in _OPEN_STATUSES:
        raise ContentReportAlreadyResolved()
    return report


def _require_moderatable_target(target) -> None:
    # Local re-implementation of the admin/staff guard; precedent:
    # app/services/admin_service.py:202 _require_bannable_target (private, not reusable).
    if target.role != "user":
        raise ModerationTargetProtected()


def _close(report, admin, status: str, body: ModerationDecision, now: datetime) -> None:
    report.status = status
    report.resolution_note = body.resolution_note.strip()
    report.reviewed_by = admin.id
    report.reviewed_at = now


def _to_list_item(report) -> ContentReportListItem:
    return ContentReportListItem(
        id=report.id,
        project_id=report.project_id,
        template_id=report.template_id,
        reported_user_id=report.reported_user_id,
        reason=report.reason,
        status=report.status,
        created_at=report.created_at,
    )


async def _to_detail(db: AsyncSession, report) -> ContentReportDetail:
    history = await moderation_repo.list_actions_for_user(db, report.reported_user_id)
    return ContentReportDetail(
        **_to_list_item(report).model_dump(),
        details=report.details,
        reporter_email=report.reporter_email,
        reporter_name=report.reporter_name,
        evidence_url=report.evidence_url,
        resolution_note=report.resolution_note,
        reviewed_by=report.reviewed_by,
        reviewed_at=report.reviewed_at,
        user_actions=[_to_action_response(action, status) for action, status in history],
    )


def _to_action_response(action, report_status: str | None) -> ModerationActionResponse:
    return ModerationActionResponse(
        id=action.id,
        level=action.level,
        action=action.action,
        restricted_until=action.restricted_until,
        report_status=report_status,
        report_id=action.report_id,
        reason=action.reason,
        created_by=action.created_by,
        created_at=action.created_at,
    )
