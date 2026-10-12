"""Reports hub domain `tai-chinh` -- Tài chính: transactions, revenue, daily-pnl, refunds, vat.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.repositories import analytics_repo
from app.services import analytics_service
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
