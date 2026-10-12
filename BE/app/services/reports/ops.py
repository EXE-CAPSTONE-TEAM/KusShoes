"""Reports hub domain `chi-phi-he-thong` -- Chi phí hệ thống: api-cost, api-cost-by-operation,
api-cost-by-user, api-budget, scan-unit-economics.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ReportTooManyRows
from app.models.scan_credit import CREDIT_STATUS_EXPIRED
from app.repositories.reports import ops as ops_repo
from app.services import api_cost_service
from app.services.period_service import to_business_date
from app.services.reports.registry import (
    WITH_PDF,
    Column,
    ReportContext,
    ReportSpec,
    register,
)

DOMAIN = "chi-phi-he-thong"

_SUCCESS_STATUS = "success"  # api_cost_entries.status of a successful call (ck_..._status)
_PERCENT_SCALE = 100  # ApiBudgetStatus.percent is 0-100; reports carry fractions
NO_USER_LABEL = "Hệ thống (không gắn tài khoản)"
BUDGET_STATE_LABELS = {
    "unconfigured": "Chưa đặt ngân sách",
    "ok": "Bình thường",
    "warning": "Cảnh báo",
    "suspended": "Tạm ngưng nhận quét",
}
TIER_LABELS = {
    "free": "Free",
    "basic_monthly": "Basic (tháng)",
    "basic_yearly": "Basic (năm)",
    "pro_monthly": "Pro (tháng)",
    "pro_yearly": "Pro (năm)",
}


# --- api-cost ------------------------------------------------------------------------------


def shape_api_cost(days: Sequence) -> list[list]:
    """BR-108 (SRS_v2.2.txt:2112): one row per GMT+7 day, zero-filled, then a total row.
    Failed calls are counted and costed too (SF-14, SRS_v2.2.txt:1767)."""
    table = [
        [row.day, row.calls, row.success_calls, row.failed_calls, row.cost_vnd] for row in days
    ]
    table.append(
        [
            "Tổng",
            sum(row.calls for row in days),
            sum(row.success_calls for row in days),
            sum(row.failed_calls for row in days),
            sum(row.cost_vnd for row in days),
        ]
    )
    return table


async def build_api_cost(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_api_cost(await api_cost_service.daily_rows(db, ctx.start, ctx.end))


register(
    ReportSpec(
        id="api-cost",
        domain=DOMAIN,
        title="Chi phí API theo ngày",
        description="Số lần gọi API 3D/AI (thành công, thất bại) và chi phí theo từng ngày GMT+7, "
        "kèm dòng tổng (SF-14, BR-108).",
        columns=(
            Column("Ngày", "date"),
            Column("Số lần gọi", "int"),
            Column("Thành công", "int"),
            Column("Thất bại", "int"),
            Column("Chi phí (VND)", "vnd"),
        ),
        build=build_api_cost,
        source_ref="BR-108, SF-14",
    )
)


# --- api-cost-by-operation -----------------------------------------------------------------


def shape_by_operation(rows: Sequence[tuple]) -> list[list]:
    """`rows`: (provider, operation, calls, ok_calls, cost_vnd). Share = cost / total cost
    (blank when the total is 0); average = cost / calls. A total row closes the table."""
    total_cost = sum(row[4] for row in rows)
    table = [
        [
            provider,
            operation,
            calls,
            ok,
            calls - ok,
            cost,
            cost / calls if calls else None,
            cost / total_cost if total_cost else None,
        ]
        for provider, operation, calls, ok, cost in rows
    ]
    calls_sum = sum(row[2] for row in rows)
    ok_sum = sum(row[3] for row in rows)
    table.append(
        [
            "Tổng",
            "",
            calls_sum,
            ok_sum,
            calls_sum - ok_sum,
            total_cost,
            total_cost / calls_sum if calls_sum else None,
            1.0 if total_cost else None,
        ]
    )
    return table


async def build_by_operation(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await ops_repo.cost_by_operation(
        db, start=ctx.start, end=ctx.end, success_status=_SUCCESS_STATUS, limit=ctx.max_rows + 1
    )
    return shape_by_operation(rows)


register(
    ReportSpec(
        id="api-cost-by-operation",
        domain=DOMAIN,
        title="Chi phí API theo nghiệp vụ",
        description="Chi phí, số lần gọi và tỷ trọng theo nhà cung cấp và nghiệp vụ API "
        "(gồm cả cuộc gọi thất bại) trong kỳ.",
        columns=(
            Column("Nhà cung cấp"),
            Column("Nghiệp vụ"),
            Column("Số lần gọi", "int"),
            Column("Thành công", "int"),
            Column("Thất bại", "int"),
            Column("Chi phí (VND)", "vnd"),
            Column("Chi phí TB/lần (VND)", "vnd"),
            Column("Tỷ trọng", "percent"),
        ),
        build=build_by_operation,
        source_ref="SF-14, BR-108",
    )
)


# --- api-cost-by-user (includes internal accounts) -----------------------------------------


def shape_by_user(rows: Sequence[tuple]) -> list[list]:
    """`rows`: (account_code | None, is_internal, tier | None, calls, scan_calls, cost_vnd).
    Internal accounts are listed on purpose (BR-79 cap monitoring) and flagged; the
    account_code is shown, never the email (BR-88)."""
    return [
        [code or NO_USER_LABEL, internal, TIER_LABELS.get(tier, tier or ""), calls, scans, cost]
        for code, internal, tier, calls, scans, cost in rows
    ]


async def build_by_user(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await ops_repo.cost_by_user(
        db,
        start=ctx.start,
        end=ctx.end,
        scan_operation=api_cost_service.SCAN_OPERATION,
        limit=ctx.max_rows + 1,
    )
    return shape_by_user(rows)


register(
    ReportSpec(
        id="api-cost-by-user",
        domain=DOMAIN,
        title="Chi phí API theo tài khoản",
        description="Chi phí API và số lượt quét theo mã khách, kèm cờ tài khoản nội bộ "
        "(có trần quét riêng, BR-79). Khác các báo cáo khác, báo cáo này KHÔNG loại tài khoản "
        "nội bộ.",
        columns=(
            Column("Mã khách"),
            Column("Nội bộ", "bool"),
            Column("Gói"),
            Column("Số lần gọi", "int"),
            Column("Lượt quét", "int"),
            Column("Chi phí (VND)", "vnd"),
        ),
        build=build_by_user,
        source_ref="SF-14, BR-79, BR-83",
    )
)


# --- api-budget (PDF allowed) --------------------------------------------------------------


def months_in_range(start: date, end: date) -> list[date]:
    """First day of every calendar month touched by start..end inclusive."""
    months = []
    cursor = start.replace(day=1)
    while cursor <= end:
        months.append(cursor)
        cursor = (cursor + timedelta(days=31)).replace(day=1)  # 31 > any month length
    return months


def shape_budget(statuses: Sequence) -> list[list]:
    """`statuses`: ApiBudgetStatus per month. `percent` becomes a fraction (1.0 = 100%);
    blank when no budget is configured. A month's spend is always the whole month."""
    return [
        [
            status.period_month,
            status.budget_vnd,
            status.spent_vnd,
            status.percent / _PERCENT_SCALE if status.percent is not None else None,
            BUDGET_STATE_LABELS.get(status.state, status.state),
            status.warned_at,
            status.suspended_at,
        ]
        for status in statuses
    ]


async def build_budget(db: AsyncSession, ctx: ReportContext) -> list[list]:
    statuses = [
        await api_cost_service.get_budget(db, month)
        for month in months_in_range(ctx.start, ctx.end)
    ]
    return shape_budget(statuses)


register(
    ReportSpec(
        id="api-budget",
        domain=DOMAIN,
        title="Ngân sách API theo tháng",
        description="Ngân sách, chi phí thực tế (cả tháng), % sử dụng và trạng thái cảnh báo / "
        "tạm ngưng nhận quét của từng tháng trong kỳ (SF-14).",
        columns=(
            Column("Tháng", "date"),
            Column("Ngân sách (VND)", "vnd"),
            Column("Đã chi (VND)", "vnd"),
            Column("% sử dụng", "percent"),
            Column("Trạng thái"),
            Column("Cảnh báo lúc", "datetime"),
            Column("Tạm ngưng lúc", "datetime"),
        ),
        build=build_budget,
        formats=WITH_PDF,
        source_ref="SF-14",
    )
)


# --- scan-unit-economics -------------------------------------------------------------------


def shape_scan_economics(
    scan_days: Sequence[tuple], credits: Sequence[tuple], ctx: ReportContext
) -> list[list]:
    """`scan_days`: (day, ok, failed, cost_vnd) of scan calls. `credits`: (purchased_at,
    consumed_at, expires_at, status, price_vnd). One zero-filled row per GMT+7 day plus a total.
    Cost per OK scan is blank when there is no successful scan (failed calls are still costed
    into 'Chi phí quét'). Credit revenue = price_vnd of Credits purchased that day (gross)."""
    scans = {day: (ok, bad, cost) for day, ok, bad, cost in scan_days}
    sold: dict = defaultdict(lambda: [0, 0])  # day -> [count, revenue]
    used: dict = defaultdict(int)
    expired: dict = defaultdict(int)
    for purchased_at, consumed_at, expires_at, status, price in credits:
        bought_on = to_business_date(purchased_at)
        if ctx.start <= bought_on <= ctx.end:
            sold[bought_on][0] += 1
            sold[bought_on][1] += price
        if consumed_at is not None:
            used_on = to_business_date(consumed_at)
            if ctx.start <= used_on <= ctx.end:
                used[used_on] += 1
        if status == CREDIT_STATUS_EXPIRED:
            expired_on = to_business_date(expires_at)
            if ctx.start <= expired_on <= ctx.end:
                expired[expired_on] += 1

    table = []
    totals = [0] * 7  # ok, failed, cost, sold, used, expired, revenue
    day = ctx.start
    while day <= ctx.end:
        ok, bad, cost = scans.get(day, (0, 0, 0))
        count, revenue = sold.get(day, (0, 0))
        values = [ok, bad, cost, count, used.get(day, 0), expired.get(day, 0), revenue]
        table.append([day, *values[:3], cost / ok if ok else None, *values[3:]])
        totals = [a + b for a, b in zip(totals, values, strict=True)]
        day += timedelta(days=1)
    ok, bad, cost, *rest = totals
    table.append(["Tổng", ok, bad, cost, cost / ok if ok else None, *rest])
    return table


async def build_scan_economics(db: AsyncSession, ctx: ReportContext) -> list[list]:
    scan_days = await ops_repo.scan_cost_by_day(
        db,
        start=ctx.start,
        end=ctx.end,
        scan_operation=api_cost_service.SCAN_OPERATION,
        success_status=_SUCCESS_STATUS,
    )
    credits = await ops_repo.credit_events(
        db,
        start_utc=ctx.start_utc,
        end_utc=ctx.end_utc,
        expired_status=CREDIT_STATUS_EXPIRED,
        limit=ctx.max_rows + 1,
    )
    if len(credits) > ctx.max_rows:
        raise ReportTooManyRows(ctx.max_rows)  # never aggregate a truncated input set
    return shape_scan_economics(scan_days, credits, ctx)


register(
    ReportSpec(
        id="scan-unit-economics",
        domain=DOMAIN,
        title="Hiệu quả kinh tế mỗi lượt quét",
        description="Theo ngày: lượt quét thành công / lỗi, chi phí quét, chi phí trên mỗi lượt "
        "quét thành công, và Credit quét đã bán / dùng / hết hạn cùng doanh thu Credit "
        "(tài khoản nội bộ bị loại khỏi phần Credit).",
        columns=(
            Column("Ngày", "date"),
            Column("Quét thành công", "int"),
            Column("Quét lỗi", "int"),
            Column("Chi phí quét (VND)", "vnd"),
            Column("Chi phí/lượt quét thành công (VND)", "vnd"),
            Column("Credit bán ra", "int"),
            Column("Credit đã dùng", "int"),
            Column("Credit hết hạn", "int"),
            Column("Doanh thu Credit (VND)", "vnd"),
        ),
        build=build_scan_economics,
        source_ref="SF-14, BR-94",
    )
)
