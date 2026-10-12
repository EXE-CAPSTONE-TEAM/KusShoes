"""Reports hub domain `tai-chinh` -- Tài chính: transactions, revenue, daily-pnl, refunds, vat.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.repositories import analytics_repo
from app.repositories.reports import finance as finance_repo
from app.services import analytics_service, api_cost_service, finance_overview_service, tax_service
from app.services.period_service import GMT7
from app.services.reports.common import (
    CREDIT_ITEM_LABEL,
    CYCLE_LABELS,
    METHOD_LABELS,
    STATUS_LABELS,
    TIER_LABELS,
    channel_label,
    yes_no,
)
from app.services.reports.registry import WITH_PDF, Column, ReportContext, ReportSpec, register

DOMAIN = "tai-chinh"


# --- transactions: "Sổ giao dịch EXE201" (BR-106) ------------------------------------------


def shape_transactions(ledger: Sequence[tuple], repeaters: set) -> list[list]:
    """BR-106 column order of sổ 07. `ledger` rows: (Invoice, first, last, account_code, channel)."""
    table = []
    for invoice, _first, _last, account_code, channel in ledger:
        snapshot = invoice.receipt_snapshot or {}
        receipt_file = (
            f"{invoice.receipt_number}-{snapshot.get('file_slug', 'khach')}"
            f"-{snapshot.get('date_code', '')}.pdf"
            if invoice.receipt_number
            else ""
        )
        tier = TIER_LABELS.get(invoice.plan_tier, invoice.plan_tier)
        item = (
            CREDIT_ITEM_LABEL
            if invoice.plan_tier == CREDIT_INVOICE_TIER
            else f"Nâng cấp lên {tier}"
            if invoice.is_upgrade
            else f"{tier} {CYCLE_LABELS.get(invoice.billing_cycle, invoice.billing_cycle)}"
        )
        table.append(
            [
                invoice.receipt_number or str(invoice.order_code),
                invoice.created_at.astimezone(GMT7).date(),
                snapshot.get("customer") or account_code,
                channel_label(channel),
                item,
                invoice.amount_vnd,
                STATUS_LABELS.get(invoice.status, invoice.status),
                METHOD_LABELS.get(invoice.payment_method, invoice.payment_method),
                receipt_file,
                yes_no(invoice.user_id in repeaters),
            ]
        )
    return table


def repeat_customers(payments: Sequence) -> set:
    return {
        user_id
        for user_id, history in analytics_service.by_user(list(payments)).items()
        if len({item.paid_at for item in history}) >= 2
    }


async def build_transactions(db: AsyncSession, ctx: ReportContext) -> list[list]:
    ledger = await analytics_repo.ledger_rows(db, start=ctx.start_utc, end=ctx.end_utc)
    payments = analytics_service.build_payments(
        await analytics_repo.paid_invoice_rows(db), await analytics_repo.refund_rows(db)
    )
    return shape_transactions(ledger, repeat_customers(payments))


register(
    ReportSpec(
        id="transactions",
        domain=DOMAIN,
        title="Sổ giao dịch EXE201",
        description="Mọi đơn hàng tạo trong kỳ theo thứ tự cột của sổ 07: mã, ngày đặt, khách, kênh, "
        "loại hàng, giá, tình trạng, hình thức thanh toán, tên file biên nhận, khách quay lại.",
        columns=(
            Column("Mã"),
            Column("Ngày đặt", "date"),
            Column("Tên khách"),
            Column("Kênh đến"),
            Column("Loại hàng hoá"),
            Column("Giá tiền", "vnd"),
            Column("Tình trạng thanh toán"),
            Column("Hình thức thanh toán"),
            Column("Tên file biên nhận"),
            Column("Khách quay lại?"),
        ),
        build=build_transactions,
        source_ref="BR-106",
    )
)


# --- revenue: summary indicators -----------------------------------------------------------


def shape_revenue(data) -> list[list]:
    table = [
        ["MRR", data.mrr_vnd],
        ["ARR", data.arr_vnd],
        ["ARPU", data.arpu_vnd],
        ["Khách trả tiền", data.paying_customers],
        ["Doanh thu ghi nhận (kỳ)", data.revenue_vnd.current],
        ["Hoàn tiền (kỳ)", data.refunds_vnd.current],
        ["Khách trả tiền mới (kỳ)", data.new_paying_customers.current],
    ]
    table += [[f"Doanh thu tháng {point.month}", point.revenue_vnd] for point in data.revenue_series]
    table += [[f"Theo gói: {plan.plan_tier}", plan.revenue_vnd] for plan in data.revenue_by_plan]
    return table


async def build_revenue(db: AsyncSession, ctx: ReportContext) -> list[list]:
    data = await analytics_service.get_analytics(db, date_from=ctx.start, date_to=ctx.end)
    return shape_revenue(data)


register(
    ReportSpec(
        id="revenue",
        domain=DOMAIN,
        title="Báo cáo doanh thu",
        description="Chỉ số doanh thu tổng hợp trong kỳ: MRR, ARR, ARPU, doanh thu ghi nhận, hoàn "
        "tiền, chuỗi theo tháng và theo gói (SRS 5.4).",
        columns=(Column("Chỉ số"), Column("Giá trị (VND)", "vnd")),
        build=build_revenue,
        formats=WITH_PDF,
        source_ref="SRS 5.4",
    )
)


# --- daily-pnl: revenue - API cost - gross margin per GMT+7 day ----------------------------


def shape_daily_pnl(
    paid_rows: Sequence[tuple],
    refund_rows: Sequence[tuple],
    api_days: Mapping[date, int],
    ctx: ReportContext,
) -> list[list]:
    """One row per business day start..end. Net (Thuần) is the dashboard's own series
    (`finance_overview_service.revenue_by_day` over `build_payments`), so file and dashboard
    agree; gross and refunds are attributed to the invoice's payment day so gross - refund = net.
    Margin = (net - API cost) / net, blank on a zero-revenue day."""
    paid_day = {row[0]: analytics_service.business_date(row[2]) for row in paid_rows}
    gross: dict[date, int] = defaultdict(int)
    for row in paid_rows:
        gross[paid_day[row[0]]] += row[3]
    refunded: dict[date, int] = defaultdict(int)
    for invoice_id, _user_id, amount, _created_at in refund_rows:
        if invoice_id in paid_day:
            refunded[paid_day[invoice_id]] += amount
    net = finance_overview_service.revenue_by_day(
        analytics_service.build_payments(list(paid_rows), list(refund_rows))
    )
    table = []
    day = ctx.start
    while day <= ctx.end:
        revenue = net.get(day, 0)
        api_cost = api_days.get(day, 0)
        table.append(
            [
                day,
                gross.get(day, 0),
                refunded.get(day, 0),
                revenue,
                api_cost,
                revenue - api_cost,
                finance_overview_service.rate(revenue - api_cost, revenue),
            ]
        )
        day += timedelta(days=1)
    return table


async def build_daily_pnl(db: AsyncSession, ctx: ReportContext) -> list[list]:
    paid_rows = await analytics_repo.paid_invoice_rows(db)
    refund_rows = await analytics_repo.refund_rows(db)
    api_rows = await api_cost_service.daily_rows(db, ctx.start, ctx.end)
    api_days = {row.day: row.cost_vnd for row in api_rows}
    return shape_daily_pnl(paid_rows, refund_rows, api_days, ctx)


register(
    ReportSpec(
        id="daily-pnl",
        domain=DOMAIN,
        title="Doanh thu - chi phí API - biên lợi nhuận theo ngày",
        description="Mỗi ngày trong kỳ: doanh thu ghi nhận, hoàn tiền, doanh thu thuần, chi phí API, "
        "lãi gộp và tỷ suất biên (thuần - chi phí API) / thuần. Cùng cách tính với trang Tài chính.",
        columns=(
            Column("Ngày", "date"),
            Column("Doanh thu ghi nhận", "vnd"),
            Column("Hoàn tiền", "vnd"),
            Column("Doanh thu thuần", "vnd"),
            Column("Chi phí API", "vnd"),
            Column("Lãi gộp", "vnd"),
            Column("Tỷ suất biên", "percent"),
        ),
        build=build_daily_pnl,
        source_ref="FD finance dashboard",
    )
)


# --- refunds: "Sổ hoàn tiền" ---------------------------------------------------------------


def shape_refunds(rows: Sequence[tuple]) -> list[list]:
    """`rows` from finance_repo.refund_ledger_rows; internal accounts are already excluded."""
    table = []
    for (
        created_at,
        receipt_number,
        order_code,
        customer_code,
        tier,
        cycle,
        invoice_amount,
        refund_amount,
        reason,
        admin_code,
    ) in rows:
        plan = f"{TIER_LABELS.get(tier, tier)} {CYCLE_LABELS.get(cycle, cycle)}"
        table.append(
            [
                analytics_service.business_date(created_at),
                receipt_number or str(order_code),
                customer_code,
                plan,
                invoice_amount,
                refund_amount,
                reason,
                admin_code,
            ]
        )
    return table


async def build_refunds(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await finance_repo.refund_ledger_rows(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_refunds(rows)


register(
    ReportSpec(
        id="refunds",
        domain=DOMAIN,
        title="Sổ hoàn tiền",
        description="Các khoản hoàn tiền phát sinh trong kỳ: ngày hoàn, đơn gốc, khách, gói, số "
        "tiền gốc, số hoàn, lý do và quản trị viên thực hiện (mã tài khoản, không có email).",
        columns=(
            Column("Ngày hoàn", "date"),
            Column("Mã đơn/biên nhận"),
            Column("Mã khách"),
            Column("Gói"),
            Column("Số tiền gốc", "vnd"),
            Column("Số hoàn", "vnd"),
            Column("Lý do"),
            Column("Người thực hiện"),
        ),
        build=build_refunds,
        source_ref="BR-97",
    )
)


# --- vat: "Bảng kê thuế GTGT" --------------------------------------------------------------


def shape_vat(rows: Sequence[tuple]) -> list[list]:
    """`rows`: (Invoice, customer_code). VAT is the figure frozen in the receipt (BR-28/BR-31);
    with VAT disabled the VAT is 0 and the before-tax price equals the amount paid."""
    table = []
    for invoice, customer_code in rows:
        breakdown = tax_service.breakdown_for_invoice(invoice)
        vat = breakdown["vat_vnd"] if breakdown["enabled"] else 0
        rate = breakdown["rate_percent"] / 100 if breakdown["enabled"] else 0.0
        table.append(
            [
                invoice.receipt_number or str(invoice.order_code),
                analytics_service.business_date(invoice.paid_at),
                customer_code,
                invoice.listed_price_vnd,
                invoice.discount_vnd,
                invoice.amount_vnd,
                invoice.amount_vnd - vat,
                vat,
                rate,
            ]
        )
    return table


async def build_vat(db: AsyncSession, ctx: ReportContext) -> list[list]:
    rows = await finance_repo.paid_invoices_between(
        db, start=ctx.start_utc, end=ctx.end_utc, limit=ctx.max_rows + 1
    )
    return shape_vat(rows)


register(
    ReportSpec(
        id="vat",
        domain=DOMAIN,
        title="Bảng kê thuế GTGT",
        description="Hoá đơn đã thanh toán trong kỳ với giá niêm yết, giảm giá, thực thu, giá trước "
        "thuế và VAT tách từ biên nhận (BR-28). Khi chưa bật VAT, cột VAT bằng 0.",
        columns=(
            Column("Số biên nhận"),
            Column("Ngày thanh toán", "date"),
            Column("Mã khách"),
            Column("Giá niêm yết", "vnd"),
            Column("Giảm giá", "vnd"),
            Column("Thực thu", "vnd"),
            Column("Giá trước thuế", "vnd"),
            Column("VAT", "vnd"),
            Column("Thuế suất", "percent"),
        ),
        build=build_vat,
        source_ref="BR-28",
    )
)
