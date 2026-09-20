import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import FeedbackNotFound, FeedbackTooSoon
from app.repositories import feedback_repo
from app.schemas.feedback import (
    AdminFeedbackResponse,
    FeedbackCreate,
    FeedbackEligibility,
    FeedbackSummary,
    FeedbackUpdate,
)
from app.services import report_service
from app.services.audit import record_audit

FEEDBACK_COOLDOWN_DAYS = 14  # BR-109: one form per 14 days

_STATUS_ORDER = ("new", "reviewed", "planned", "done", "wont_do")


async def _next_allowed_at(db: AsyncSession, user_id: uuid.UUID) -> datetime | None:
    latest = await feedback_repo.latest_for_user(db, user_id)
    if not latest:
        return None
    unlock = latest.created_at + timedelta(days=FEEDBACK_COOLDOWN_DAYS)
    return unlock if unlock > datetime.now(UTC) else None


async def get_eligibility(db: AsyncSession, user) -> FeedbackEligibility:
    next_allowed = await _next_allowed_at(db, user.id)
    return FeedbackEligibility(can_submit=next_allowed is None, next_allowed_at=next_allowed)


async def submit(db: AsyncSession, user, body: FeedbackCreate):
    next_allowed = await _next_allowed_at(db, user.id)
    if next_allowed is not None:
        raise FeedbackTooSoon(next_allowed)
    feedback = await feedback_repo.create(
        db,
        user_id=user.id,
        rating=body.rating,
        message=body.message.strip(),
        marketing_group=body.marketing_group,
        is_internal=bool(user.is_internal),
    )
    await db.commit()
    return feedback


async def list_mine(db: AsyncSession, user):
    return await feedback_repo.list_for_user(db, user.id)


# --- Admin ----------------------------------------------------------------------------


def _to_admin(feedback, email: str | None) -> AdminFeedbackResponse:
    return AdminFeedbackResponse(
        id=feedback.id,
        rating=feedback.rating,
        marketing_group=feedback.marketing_group,
        message=feedback.message,
        status=feedback.status,
        changed_what=feedback.changed_what,
        created_at=feedback.created_at,
        user_id=feedback.user_id,
        user_email=email,
        is_internal=feedback.is_internal,
        reviewed_at=feedback.reviewed_at,
    )


async def list_admin(
    db: AsyncSession,
    *,
    status: str | None,
    marketing_group: str | None,
    rating: int | None,
    include_internal: bool,
) -> list[AdminFeedbackResponse]:
    rows = await feedback_repo.list_admin(
        db,
        status=status,
        marketing_group=marketing_group,
        rating=rating,
        include_internal=include_internal,
    )
    return [_to_admin(feedback, email) for feedback, email in rows]


async def update(
    db: AsyncSession, admin, feedback_id: uuid.UUID, body: FeedbackUpdate
) -> AdminFeedbackResponse:
    feedback = await feedback_repo.get_by_id(db, feedback_id)
    if not feedback:
        raise FeedbackNotFound()
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(feedback, field, value)
    feedback.reviewed_by = admin.id
    feedback.reviewed_at = datetime.now(UTC)
    await record_audit(
        db, admin, "feedback.update", target_type="feedback", target_id=feedback.id,
        payload=changes,
    )
    await db.commit()
    return _to_admin(feedback, None)


async def summary(db: AsyncSession) -> FeedbackSummary:
    data = await feedback_repo.rating_summary(db)
    data["by_status"] = {status: data["by_status"].get(status, 0) for status in _STATUS_ORDER}
    return FeedbackSummary(**data)


async def export_xlsx(db: AsyncSession, *, include_internal: bool = False) -> bytes:
    """Internal accounts are excluded from the export unless explicitly requested."""
    rows = await feedback_repo.list_admin(db, include_internal=include_internal, limit=10000)
    headers = [
        "Ngày gửi", "Email", "Đánh giá", "Nhóm 4P", "Nội dung", "Trạng thái", "Đã thay đổi gì"
    ]
    table = [
        [
            feedback.created_at.strftime("%Y-%m-%d %H:%M"),
            email or "",
            feedback.rating,
            feedback.marketing_group,
            feedback.message,
            feedback.status,
            feedback.changed_what or "",
        ]
        for feedback, email in rows
    ]
    return await asyncio.to_thread(report_service.render_xlsx, "Feedback", headers, table)
