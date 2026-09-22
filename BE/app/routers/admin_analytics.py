from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.analytics import AnalyticsResponse
from app.services import analytics_service, report_service
from app.utils.http import attachment_response

router = APIRouter()


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await analytics_service.get_analytics(db, date_from=date_from, date_to=date_to)


@router.get("/reports/{report_type}")
async def download_report(
    report_type: Literal["revenue", "users", "transactions", "channel-funnel", "api-cost"],
    format: Literal["csv", "xlsx", "pdf"] = "csv",
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    data, content_type, filename = await report_service.generate(
        db, report_type, format, date_from=date_from, date_to=date_to
    )
    return attachment_response(data, content_type, filename)
