"""Reports hub domain `goi-thanh-toan` -- Gói & thanh toán: revenue-by-plan, subscriptions,
mrr-movement, unpaid-invoices, coupons.

Each report is a thin async fetch plus a PURE `shape_*` function (unit-tested without a DB).
Metric maths is reused from analytics_service so the files agree with the dashboard."""

import calendar
from collections import defaultdict
from collections.abc import Sequence
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import analytics_repo, coupon_repo
from app.repositories.reports import billing as billing_repo
from app.services import analytics_service
from app.services.analytics_service import Payment
from app.services.period_service import GMT7
from app.services.reports.common import (
    CYCLE_LABELS,
    METHOD_LABELS,
    STATUS_LABELS,
    TIER_LABELS,
)
from app.services.reports.registry import WITH_PDF, Column, ReportContext, ReportSpec, register

DOMAIN = "goi-thanh-toan"

SUBSCRIPTION_TIER_LABELS = {
    "free": "Free",
    "basic_monthly": "Basic tháng",
    "basic_yearly": "Basic năm",
    "pro_monthly": "Pro tháng",
    "pro_yearly": "Pro năm",
}
SUBSCRIPTION_STATUS_LABELS = {
    "active": "Đang hoạt động",
    "grace": "Gia hạn (grace)",
    "cancelled": "Đã hủy",
    "expired": "Hết hạn",
}
COUPON_TYPE_LABELS = {
    "percent": "Giảm theo %",
    "fixed": "Giảm số tiền",
    "fixed_price": "Đồng giá",
}


def _yes_no(value: bool) -> str:
    return "Có" if value else "Không"


def _local_date(moment) -> date | None:
    return moment.astimezone(GMT7).date() if moment else None


def _tier_label(tier: str) -> str:
    return TIER_LABELS.get(tier, tier)


def _cycle_label(cycle: str) -> str:
    return CYCLE_LABELS.get(cycle, cycle)


def _in_window(moment, ctx: ReportContext) -> bool:
    return ctx.start <= analytics_service.business_date(moment) <= ctx.end


async def _net_payments(db: AsyncSession) -> list[Payment]:
    return analytics_service.build_payments(
        await analytics_repo.paid_invoice_rows(db), await analytics_repo.refund_rows(db)
    )


# --- revenue-by-plan -------------------------------------------------------------------------


def shape_revenue_by_plan(payments: Sequence[Payment], ctx: ReportContext) -> list[list]:
    """Net (refund-adjusted) cash per plan tier and cycle, payments dated inside the window.
    Share = the row's net revenue / total net revenue of the window."""
    cells: dict = defaultdict(lambda: [0, set(), 0])
    for payment in payments:
        if not _in_window(payment.paid_at, ctx):
            continue
        cell = cells[(payment.plan_tier, payment.billing_cycle)]
        cell[0] += 1
        cell[1].add(payment.user_id)
        cell[2] += payment.amount
    total = sum(cell[2] for cell in cells.values())
    ordered = sorted(cells.items(), key=lambda item: (-item[1][2], item[0]))
    return [
        [
            _tier_label(tier),
            _cycle_label(cycle),
            count,
            len(customers),
            revenue,
            revenue / total if total else None,
        ]
        for (tier, cycle), (count, customers, revenue) in ordered
    ]


async def build_revenue_by_plan(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_revenue_by_plan(await _net_payments(db), ctx)


register(
    ReportSpec(
        id="revenue-by-plan",
        domain=DOMAIN,
        title="Doanh thu theo gói",
        description="Doanh thu thuần (đã trừ hoàn tiền) theo gói và chu kỳ trong kỳ, kèm số giao "
        "dịch, số khách và tỷ trọng. Không gồm tài khoản nội bộ (BR-83).",
        columns=(
            Column("Gói"),
            Column("Chu kỳ"),
            Column("Số giao dịch", "int"),
            Column("Số khách", "int"),
            Column("Doanh thu thuần", "vnd"),
            Column("Tỷ trọng", "percent"),
        ),
        build=build_revenue_by_plan,
        formats=WITH_PDF,
        source_ref="SRS 5.4",
    )
)


# --- subscriptions (snapshot) ----------------------------------------------------------------


def shape_subscriptions(rows: Sequence[tuple]) -> list[list]:
    """`rows`: (account_code, tier, status, started_at, expires_at, grace_until, is_comp,
    cancel_at_period_end)."""
    return [
        [
            row[0],
            SUBSCRIPTION_TIER_LABELS.get(row[1], row[1]),
            SUBSCRIPTION_STATUS_LABELS.get(row[2], row[2]),
            _local_date(row[3]),
            _local_date(row[4]),
            _local_date(row[5]),
            _yes_no(row[6]),
            _yes_no(row[7]),
        ]
        for row in rows
    ]


async def build_subscriptions(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_subscriptions(await billing_repo.subscription_snapshot(db, limit=ctx.max_rows + 1))


register(
    ReportSpec(
        id="subscriptions",
        domain=DOMAIN,
        title="Danh sách gói đăng ký",
        description="Ảnh chụp hiện tại của gói từng khách: trạng thái, ngày bắt đầu, hết hạn, "
        "grace, gói tặng (COMP) và hủy cuối kỳ. Không phụ thuộc kỳ báo cáo.",
        columns=(
            Column("Mã khách"),
            Column("Gói"),
            Column("Trạng thái"),
            Column("Bắt đầu", "date"),
            Column("Hết hạn", "date"),
            Column("Grace đến", "date"),
            Column("Gói tặng (COMP)?"),
            Column("Hủy cuối kỳ?"),
        ),
        build=build_subscriptions,
        date_scoped=False,
        source_ref="BR-90, BR-103",
    )
)


# --- mrr-movement ----------------------------------------------------------------------------


def _months_between(start: date, end: date) -> list[str]:
    keys, year, month = [], start.year, start.month
    while (year, month) <= (end.year, end.month):
        keys.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return keys


def shape_mrr_movement(payments: Sequence[Payment], ctx: ReportContext) -> list[list]:
    """One row per GMT+7 month touched by the window. `payments` must already be plan payments
    (analytics_service.recurring_payments): Credit is not MRR."""
    plan_payments = list(payments)
    monthly = analytics_service.monthly_revenue_by_user(plan_payments)
    user_payments = analytics_service.by_user(plan_payments)
    table = []
    for key in _months_between(ctx.start, ctx.end):
        year, month = int(key[:4]), int(key[5:])
        first, last = date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
        movement = analytics_service.compute_movement(monthly, key)
        churn = analytics_service.compute_churn(user_payments, first, last)
        retention = analytics_service.compute_retention(monthly, key)
        table.append(
            [
                key,
                movement.new,
                movement.expansion,
                movement.reactivation,
                movement.contraction,
                movement.churn,
                movement.net_new,
                churn.due,
                churn.churned,
                churn.rate,
                retention.nrr,
                retention.grr,
            ]
        )
    return table


async def build_mrr_movement(db: AsyncSession, ctx: ReportContext) -> list[list]:
    payments = analytics_service.recurring_payments(await _net_payments(db))
    return shape_mrr_movement(payments, ctx)


register(
    ReportSpec(
        id="mrr-movement",
        domain=DOMAIN,
        title="Biến động MRR theo tháng",
        description="Doanh thu gói mới, mở rộng, tái kích hoạt, thu hẹp, rời bỏ và net new theo "
        "tháng, cùng số khách đến hạn, tỷ lệ churn, NRR và GRR (SRS 5.4, xấp xỉ theo dòng tiền).",
        columns=(
            Column("Tháng"),
            Column("Mới", "vnd"),
            Column("Mở rộng", "vnd"),
            Column("Tái kích hoạt", "vnd"),
            Column("Thu hẹp", "vnd"),
            Column("Churn", "vnd"),
            Column("Net new", "vnd"),
            Column("Khách đến hạn", "int"),
            Column("Khách rời bỏ", "int"),
            Column("% churn", "percent"),
            Column("NRR", "percent"),
            Column("GRR", "percent"),
        ),
        build=build_mrr_movement,
        formats=WITH_PDF,
        source_ref="SRS 5.4, BR-104",
    )
)


# --- unpaid-invoices -------------------------------------------------------------------------


def shape_unpaid_invoices(rows: Sequence[tuple]) -> list[list]:
    """`rows`: (order_code, created_at, account_code, plan_tier, billing_cycle, amount_vnd,
    status, payment_method, is_manual)."""
    return [
        [
            str(row[0]),
            _local_date(row[1]),
            row[2],
            f"{_tier_label(row[3])} {_cycle_label(row[4])}",
            row[5],
            STATUS_LABELS.get(row[6], row[6]),
            METHOD_LABELS.get(row[7], row[7]),
            _yes_no(row[8]),
        ]
        for row in rows
    ]


async def build_unpaid_invoices(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_unpaid_invoices(
        await billing_repo.unpaid_invoices(
            db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
        )
    )


register(
    ReportSpec(
        id="unpaid-invoices",
        domain=DOMAIN,
        title="Hóa đơn chưa thanh toán",
        description="Đơn tạo trong kỳ chưa thu được tiền: thất bại, đã hủy, chờ thanh toán và "
        "chờ duyệt, kèm phương thức và đơn thủ công.",
        columns=(
            Column("Mã đơn"),
            Column("Ngày tạo", "date"),
            Column("Mã khách"),
            Column("Gói"),
            Column("Số tiền", "vnd"),
            Column("Trạng thái"),
            Column("Phương thức"),
            Column("Thủ công?"),
        ),
        build=build_unpaid_invoices,
        source_ref="SRS 5.4",
    )
)


# --- coupons ---------------------------------------------------------------------------------


def _coupon_value(coupon) -> str:
    if coupon.discount_type == "percent":
        return f"{coupon.value}%"
    return f"{coupon.value:,}".replace(",", ".") + " đ"


def _coupon_validity(coupon) -> str:
    start, end = _local_date(coupon.valid_from), _local_date(coupon.valid_until)
    if start is None and end is None:
        return "Không giới hạn"
    left = f"{start:%d/%m/%Y}" if start else "…"
    right = f"{end:%d/%m/%Y}" if end else "…"
    return f"{left} – {right}"


def shape_coupons(coupons: Sequence, usage: Sequence[tuple], net_by_invoice: dict) -> list[list]:
    """`coupons`: Coupon rows; `usage`: (invoice_id, coupon_code, discount_vnd) of invoices paid
    in the window; `net_by_invoice`: invoice_id -> refund-adjusted amount (absent = fully refunded).
    Codes match case-insensitively, as coupon_repo.get_by_code does."""
    uses: dict = defaultdict(lambda: [0, 0, 0])
    for invoice_id, code, discount in usage:
        cell = uses[(code or "").strip().upper()]
        cell[0] += 1
        cell[1] += discount
        cell[2] += net_by_invoice.get(invoice_id, 0)
    table = []
    for coupon in coupons:
        count, discount, revenue = uses.get(coupon.code.strip().upper(), (0, 0, 0))
        limit = coupon.max_uses if coupon.max_uses is not None else "∞"
        table.append(
            [
                coupon.code,
                COUPON_TYPE_LABELS.get(coupon.discount_type, coupon.discount_type),
                _coupon_value(coupon),
                ", ".join(_tier_label(t) for t in coupon.plan_tiers)
                if coupon.plan_tiers
                else "Tất cả",
                _coupon_validity(coupon),
                f"{coupon.used_count}/{limit}",
                count,
                discount,
                revenue,
            ]
        )
    return table


async def build_coupons(db: AsyncSession, ctx: ReportContext) -> list[list]:
    coupons = await coupon_repo.list_all(db)
    usage = await billing_repo.coupon_invoice_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    net = {payment.invoice_id: payment.amount for payment in await _net_payments(db)}
    return shape_coupons(coupons, usage, net)


register(
    ReportSpec(
        id="coupons",
        domain=DOMAIN,
        title="Hiệu quả mã giảm giá",
        description="Từng mã giảm giá: loại, giá trị, gói áp dụng, hiệu lực, lượt dùng tích lũy "
        "và trong kỳ, tổng tiền giảm và doanh thu thuần của các đơn dùng mã (BR-26).",
        columns=(
            Column("Mã"),
            Column("Loại"),
            Column("Giá trị"),
            Column("Gói áp dụng"),
            Column("Hiệu lực"),
            Column("Đã dùng/Tối đa"),
            Column("Lượt dùng trong kỳ", "int"),
            Column("Tổng giảm", "vnd"),
            Column("Doanh thu thuần", "vnd"),
        ),
        build=build_coupons,
        source_ref="BR-26",
    )
)
