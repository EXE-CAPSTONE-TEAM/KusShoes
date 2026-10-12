"""Reports hub domain `thiet-ke-3d` -- Thiết kế 3D: projects-daily, bake-jobs, file-exports,
quota-usage, templates (snapshot).

Each report = thin async fetch (SQL lives in repositories/reports/design.py) + a PURE `shape_*`
function. Business days are GMT+7 (CR-01); internal accounts are excluded in the repository."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import design_template_repo
from app.repositories.reports import design as design_repo
from app.services.analytics_service import business_date
from app.services.reports.registry import Column, ReportContext, ReportSpec, register

DOMAIN = "thiet-ke-3d"

BYTES_PER_MB = 1024 * 1024  # provenance: definition of a mebibyte (2^20 bytes)
KIND_LABELS = {"bake": "Bake", "prepare": "Prepare"}
PRIORITY_LABELS = {"low": "Thấp", "normal": "Thường", "high": "Cao"}
TIER_LABELS = {
    "free": "Free",
    "basic_monthly": "Basic (tháng)",
    "basic_yearly": "Basic (năm)",
    "pro_monthly": "Pro (tháng)",
    "pro_yearly": "Pro (năm)",
}
TEMPLATE_STATUS_LABELS = {"pending": "Chờ duyệt", "approved": "Đã duyệt", "rejected": "Từ chối"}


def _in_window(day: date, ctx: ReportContext) -> bool:
    return ctx.start <= day <= ctx.end


# --- projects-daily ---------------------------------------------------------------------------


def shape_projects_daily(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`rows`: (user_id, created_at, deleted_at, has_design). A project counts as created on its
    creation day and as deleted on its deletion day (two different days are two different cells)."""
    created: dict = defaultdict(int)
    saved: dict = defaultdict(int)
    deleted: dict = defaultdict(int)
    creators: dict = defaultdict(set)
    for user_id, created_at, deleted_at, has_design in rows:
        day = business_date(created_at)
        if _in_window(day, ctx):
            created[day] += 1
            saved[day] += bool(has_design)
            creators[day].add(user_id)
        if deleted_at is not None:
            gone = business_date(deleted_at)
            if _in_window(gone, ctx):
                deleted[gone] += 1
    return [
        [day, created[day], saved[day], deleted[day], len(creators[day])]
        for day in sorted(set(created) | set(deleted))
    ]


async def build_projects_daily(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await design_repo.project_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_projects_daily(rows, ctx)


register(
    ReportSpec(
        id="projects-daily",
        domain=DOMAIN,
        title="Dự án theo ngày",
        description="Số dự án tạo mới, dự án đã lưu thiết kế, dự án đã xóa và số người tạo "
        "theo ngày (GMT+7). Không gồm tài khoản nội bộ.",
        columns=(
            Column("Ngày", "date"),
            Column("Tạo mới", "int"),
            Column("Có thiết kế lưu", "int"),
            Column("Đã xóa", "int"),
            Column("Số người tạo", "int"),
        ),
        build=build_projects_daily,
        source_ref="BR-83",
    )
)


# --- bake-jobs --------------------------------------------------------------------------------


def shape_bake_jobs(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`rows`: (queued_at, kind, priority, status, started_at, completed_at). Average duration is
    over COMPLETED jobs that have both timestamps; unfinished/failed jobs never dilute it."""
    cells: dict = defaultdict(
        lambda: {"total": 0, "completed": 0, "failed": 0, "cancelled": 0, "secs": []}
    )
    for queued_at, kind, priority, status, started_at, completed_at in rows:
        day = business_date(queued_at)
        if not _in_window(day, ctx):
            continue
        cell = cells[(day, kind, priority)]
        cell["total"] += 1
        if status in ("completed", "failed", "cancelled"):
            cell[status] += 1
        if status == "completed" and started_at is not None and completed_at is not None:
            cell["secs"].append((completed_at - started_at).total_seconds())
    table = []
    for (day, kind, priority), cell in sorted(cells.items()):
        secs = cell["secs"]
        table.append(
            [
                day,
                KIND_LABELS.get(kind, kind),
                PRIORITY_LABELS.get(priority, priority),
                cell["total"],
                cell["completed"],
                cell["failed"],
                cell["cancelled"],
                round(sum(secs) / len(secs), 1) if secs else None,
            ]
        )
    return table


async def build_bake_jobs(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await design_repo.bake_job_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_bake_jobs(rows, ctx)


register(
    ReportSpec(
        id="bake-jobs",
        domain=DOMAIN,
        title="Tác vụ bake / prepare",
        description="Số tác vụ bake và prepare theo ngày, loại, ưu tiên: hoàn tất, lỗi, hủy và "
        "thời gian xử lý trung bình của các tác vụ đã hoàn tất.",
        columns=(
            Column("Ngày", "date"),
            Column("Loại"),
            Column("Ưu tiên"),
            Column("Tổng", "int"),
            Column("Hoàn tất", "int"),
            Column("Lỗi", "int"),
            Column("Hủy", "int"),
            Column("Thời gian TB (s)"),
        ),
        build=build_bake_jobs,
    )
)


# --- file-exports -----------------------------------------------------------------------------


def shape_file_exports(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`rows`: (created_at, format, is_watermarked, file_size_bytes, download_count)."""
    cells: dict = defaultdict(lambda: [0, 0, 0, 0])  # files, watermarked, bytes, downloads
    for created_at, fmt, watermarked, size, downloads in rows:
        day = business_date(created_at)
        if not _in_window(day, ctx):
            continue
        cell = cells[(day, fmt)]
        cell[0] += 1
        cell[1] += bool(watermarked)
        cell[2] += size or 0
        cell[3] += downloads or 0
    return [
        [day, str(fmt).upper(), files, wm, round(size / BYTES_PER_MB, 2), downloads]
        for (day, fmt), (files, wm, size, downloads) in sorted(cells.items())
    ]


async def build_file_exports(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await design_repo.export_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_file_exports(rows, ctx)


register(
    ReportSpec(
        id="file-exports",
        domain=DOMAIN,
        title="Xuất file thiết kế",
        description="Số file xuất theo ngày và định dạng: file có watermark, dung lượng (MB) "
        "và lượt tải.",
        columns=(
            Column("Ngày", "date"),
            Column("Định dạng"),
            Column("Số file", "int"),
            Column("Watermark", "int"),
            Column("Dung lượng (MB)"),
            Column("Lượt tải", "int"),
        ),
        build=build_file_exports,
    )
)


# --- quota-usage ------------------------------------------------------------------------------


def shape_quota_usage(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`rows`: (period_start, tier, projects, exports, ai_credits, scans). Aggregated per cycle
    month (GMT+7 date of period_start) and tier; no per-user rows (BR-88)."""
    cells: dict = defaultdict(lambda: [0, 0, 0, 0, 0])
    for period_start, tier, projects, exports, credits, scans in rows:
        day = business_date(period_start)
        if not _in_window(day, ctx):
            continue
        cell = cells[(f"{day.year:04d}-{day.month:02d}", tier)]
        for i, value in enumerate((1, projects, exports, credits, scans)):
            cell[i] += value or 0
    return [
        [period, TIER_LABELS.get(tier, tier), *counts]
        for (period, tier), counts in sorted(cells.items())
    ]


async def build_quota_usage(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await design_repo.quota_usage_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_quota_usage(rows, ctx)


register(
    ReportSpec(
        id="quota-usage",
        domain=DOMAIN,
        title="Sử dụng hạn mức theo gói",
        description="Dự án, lượt xuất, AI credit và lượt quét đã dùng, tổng hợp theo kỳ và gói "
        "(không liệt kê từng người dùng).",
        columns=(
            Column("Kỳ"),
            Column("Gói"),
            Column("Số user", "int"),
            Column("Dự án", "int"),
            Column("Export", "int"),
            Column("AI credit", "int"),
            Column("Lượt quét", "int"),
        ),
        build=build_quota_usage,
        source_ref="BR-23",
    )
)


# --- templates (snapshot of the current catalogue, not date-scoped) ---------------------------


def shape_templates(templates: Sequence) -> list[list]:
    return [
        [
            template.name,
            template.category or "",
            TEMPLATE_STATUS_LABELS.get(template.status, template.status),
            template.layer_count,
            template.use_count,
            business_date(template.created_at),
        ]
        for template in templates
    ]


async def build_templates(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_templates(await design_template_repo.list_templates(db))


register(
    ReportSpec(
        id="templates",
        domain=DOMAIN,
        title="Mẫu thiết kế (ảnh chụp hiện tại)",
        description="Danh mục mẫu thiết kế tại thời điểm xuất: danh mục, trạng thái, số layer, "
        "lượt dùng. Không phụ thuộc khoảng ngày.",
        columns=(
            Column("Tên"),
            Column("Danh mục"),
            Column("Trạng thái"),
            Column("Layer", "int"),
            Column("Lượt dùng", "int"),
            Column("Ngày tạo", "date"),
        ),
        build=build_templates,
        date_scoped=False,
    )
)
