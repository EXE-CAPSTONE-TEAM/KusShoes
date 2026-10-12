from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.report import ReportCatalogue, ReportColumn, ReportDomain, ReportItem
from app.services import reports
from app.utils.http import attachment_response

router = APIRouter()


@router.get("/reports", response_model=ReportCatalogue)
async def list_reports(admin=Depends(get_current_admin)):
    entries = reports.catalogue(admin.role)
    domains = [
        ReportDomain(
            key=key,
            label=label,
            reports=[
                ReportItem(
                    id=entry.spec.id,
                    title=entry.spec.title,
                    description=entry.spec.description,
                    formats=list(entry.spec.formats),
                    date_scoped=entry.spec.date_scoped,
                    sensitive=entry.spec.sensitive,
                    locked=entry.locked,
                    max_range_days=(
                        entry.spec.max_range_days or settings.REPORT_MAX_RANGE_DAYS
                        if entry.spec.date_scoped
                        else 0
                    ),
                    columns=[
                        ReportColumn(label=c.label, kind=c.kind) for c in entry.spec.columns
                    ],
                )
                for entry in entries
                if entry.spec.domain == key
            ],
        )
        for key, label in reports.DOMAINS
    ]
    return ReportCatalogue(max_rows=settings.REPORT_MAX_ROWS, domains=domains)


@router.get("/reports/{report_id}")
async def download_report(
    report_id: str,
    format: Literal["csv", "xlsx", "pdf"] = "csv",
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    data, content_type, filename = await reports.generate(
        db, admin, report_id, format, date_from, date_to
    )
    return attachment_response(data, content_type, filename)
