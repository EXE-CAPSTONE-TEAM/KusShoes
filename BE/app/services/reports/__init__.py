"""Reports hub facade (RP-1). Import this package, not the domain modules.

Adding a report: in your domain module (finance.py, billing.py, users.py, design.py, ops.py,
trust.py) write a thin async fetch + a PURE `shape_*` function and call
`registry.register(ReportSpec(...))` at import time. Nothing else changes: validation, sensitivity,
row cap, rendering, audit and filename are handled by `generate` below.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    ReportForbidden,
    ReportFormatUnsupported,
    ReportNotFound,
    ReportRangeInvalid,
    ReportRangeTooLarge,
    ReportTooManyRows,
)
from app.services.audit import record_audit
from app.services.period_service import GMT7

# Domain modules register their specs on import; one name per domain so parallel authors only
# ever edit their own file.
from app.services.reports import (  # noqa: F401
    billing,
    design,
    finance,
    ops,
    registry,
    render,
    trust,
    users,
)
from app.services.reports.registry import (
    DOMAINS,
    Column,
    ReportContext,
    ReportSpec,
    register,
)
from app.utils.http import XLSX_MEDIA_TYPE

__all__ = [
    "CONTENT_TYPES",
    "DOMAINS",
    "Column",
    "ReportContext",
    "ReportSpec",
    "build_context",
    "catalogue",
    "generate",
    "register",
]

CONTENT_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": XLSX_MEDIA_TYPE,
    "pdf": "application/pdf",
}
DEFAULT_RANGE_DAYS = 30  # same default window as the analytics page (spec.md FINANCE_SERIES_DAYS)


@dataclass(frozen=True)
class CatalogueEntry:
    spec: ReportSpec
    locked: bool  # sensitive report seen by a non-admin: listed but not exportable


def catalogue(role: str) -> list[CatalogueEntry]:
    return [
        CatalogueEntry(spec, locked=spec.sensitive and role != "admin")
        for spec in registry.all_specs()
    ]


def _business_today(now: datetime) -> date:
    return now.astimezone(GMT7).date()


def build_context(
    spec: ReportSpec,
    role: str,
    date_from: date | None,
    date_to: date | None,
    *,
    now: datetime | None = None,
) -> ReportContext:
    """Validate the requested range and derive the GMT+7 day bounds as a half-open UTC window.
    Reports that are not date-scoped ignore the range (snapshot at extraction time)."""
    moment = (now or datetime.now(UTC)).astimezone(GMT7)
    today = _business_today(moment)
    end = date_to or today
    start = date_from or end - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if spec.date_scoped:
        if start > end:
            raise ReportRangeInvalid()
        limit = spec.max_range_days or settings.REPORT_MAX_RANGE_DAYS
        if (end - start).days + 1 > limit:
            raise ReportRangeTooLarge(limit)
    else:
        start = end = today
    start_utc = datetime(start.year, start.month, start.day, tzinfo=GMT7).astimezone(UTC)
    end_utc = (datetime(end.year, end.month, end.day, tzinfo=GMT7) + timedelta(days=1)).astimezone(
        UTC
    )
    return ReportContext(
        start=start,
        end=end,
        start_utc=start_utc,
        end_utc=end_utc,
        generated_at=moment,
        actor_role=role,
        max_rows=settings.REPORT_MAX_ROWS,
    )


def _info(spec: ReportSpec, ctx: ReportContext, row_count: int) -> list[tuple[str, object]]:
    period = (
        f"{ctx.start:%d/%m/%Y} – {ctx.end:%d/%m/%Y}"
        if spec.date_scoped
        else "Không áp dụng (số liệu tại thời điểm trích xuất)"
    )
    return [
        ("Tên báo cáo", spec.title),
        ("Kỳ báo cáo (GMT+7)", period),
        ("Thời điểm trích xuất (GMT+7)", f"{ctx.generated_at:%d/%m/%Y %H:%M}"),
        ("Người xuất (vai trò)", ctx.actor_role),
        ("Số dòng", row_count),
    ]


def _filename(spec: ReportSpec, ctx: ReportContext, fmt: str) -> str:
    if spec.date_scoped:
        return f"{spec.id}_{ctx.start.isoformat()}_{ctx.end.isoformat()}.{fmt}"
    return f"{spec.id}_{ctx.end.isoformat()}.{fmt}"


def render_report(spec: ReportSpec, ctx: ReportContext, fmt: str, rows: list[list]) -> bytes:
    """CPU-bound; call via asyncio.to_thread."""
    headers = [column.label for column in spec.columns]
    table = render.format_rows([column.kind for column in spec.columns], rows)
    if fmt == "csv":
        return render.render_csv(headers, table)
    if fmt == "xlsx":
        return render.render_xlsx(spec.title, headers, table, _info(spec, ctx, len(table)))
    return render.render_pdf(spec.title, headers, table)


async def generate(
    db: AsyncSession,
    actor,
    report_id: str,
    fmt: str,
    date_from: date | None,
    date_to: date | None,
) -> tuple[bytes, str, str]:
    """Returns (content, content_type, filename) and records a `report.export` audit row."""
    spec = registry.get(report_id)
    if spec is None:
        raise ReportNotFound()
    if spec.sensitive and actor.role != "admin":
        raise ReportForbidden()
    if fmt not in spec.formats:
        raise ReportFormatUnsupported(fmt)
    ctx = build_context(spec, actor.role, date_from, date_to)
    rows = await spec.build(db, ctx)
    if len(rows) > ctx.max_rows:
        raise ReportTooManyRows(ctx.max_rows)  # never silently truncate
    data = await asyncio.to_thread(render_report, spec, ctx, fmt, rows)
    await record_audit(
        db,
        actor,
        "report.export",
        target_type="report",
        target_id=spec.id,
        payload={
            "format": fmt,
            "date_from": ctx.start.isoformat() if spec.date_scoped else None,
            "date_to": ctx.end.isoformat() if spec.date_scoped else None,
            "rows": len(rows),
        },
    )
    await db.commit()
    return data, CONTENT_TYPES[fmt], _filename(spec, ctx, fmt)
