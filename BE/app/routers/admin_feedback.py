import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.feedback import (
    AdminFeedbackResponse,
    FeedbackStatus,
    FeedbackSummary,
    FeedbackUpdate,
    MarketingGroup,
)
from app.services import feedback_service
from app.utils.http import XLSX_MEDIA_TYPE, attachment_response

router = APIRouter()


@router.get("/feedback", response_model=list[AdminFeedbackResponse])
async def list_feedback(
    status: FeedbackStatus | None = None,
    marketing_group: MarketingGroup | None = None,
    rating: int | None = Query(default=None, ge=1, le=5),
    include_internal: bool = False,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await feedback_service.list_admin(
        db,
        status=status,
        marketing_group=marketing_group,
        rating=rating,
        include_internal=include_internal,
    )


@router.get("/feedback/summary", response_model=FeedbackSummary)
async def feedback_summary(
    db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)
):
    return await feedback_service.summary(db)


@router.get("/feedback/export")
async def export_feedback(
    include_internal: bool = False,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    data = await feedback_service.export_xlsx(db, include_internal=include_internal)
    return attachment_response(data, XLSX_MEDIA_TYPE, "feedback.xlsx")


@router.patch("/feedback/{feedback_id}", response_model=AdminFeedbackResponse)
async def update_feedback(
    feedback_id: uuid.UUID,
    body: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await feedback_service.update(db, admin, feedback_id, body)
