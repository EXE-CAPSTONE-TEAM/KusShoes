"""BR-77 / UC-24 admin triage of content reports (SRS_v2.2.txt:2042, :194)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.admin import CursorPage
from app.schemas.moderation import (
    ContentReportDetail,
    ContentReportListItem,
    ModerationActionResponse,
    ModerationDecision,
    ReportStatus,
)
from app.services import moderation_service

router = APIRouter()


@router.get("/content-reports", response_model=CursorPage[ContentReportListItem])
async def list_content_reports(
    status: ReportStatus | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await moderation_service.list_reports(db, status=status, limit=limit, cursor=cursor)


@router.get("/content-reports/{report_id}", response_model=ContentReportDetail)
async def get_content_report(
    report_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)
):
    return await moderation_service.get_report(db, report_id)


@router.post("/content-reports/{report_id}/uphold", response_model=ModerationActionResponse)
async def uphold_content_report(
    report_id: uuid.UUID,
    body: ModerationDecision,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await moderation_service.uphold(db, admin, report_id, body)


@router.post("/content-reports/{report_id}/dismiss", response_model=ContentReportDetail)
async def dismiss_content_report(
    report_id: uuid.UUID,
    body: ModerationDecision,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await moderation_service.dismiss(db, admin, report_id, body)


@router.get(
    "/users/{user_id}/moderation-actions", response_model=list[ModerationActionResponse]
)
async def list_user_moderation_actions(
    user_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)
):
    return await moderation_service.list_user_actions(db, user_id)
