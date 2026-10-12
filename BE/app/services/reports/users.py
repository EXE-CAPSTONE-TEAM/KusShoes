"""Reports hub domain `nguoi-dung` -- Người dùng: users (sensitive), signups-daily, channel-funnel,
utm-attribution, repeat-customers.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections import defaultdict
from collections.abc import Collection, Sequence
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import analytics_repo
from app.repositories.reports import users as users_repo
from app.services import analytics_service
from app.services.reports.common import channel_label, yes_no
from app.services.reports.registry import Column, ReportContext, ReportSpec, register

DOMAIN = "nguoi-dung"


def _in_window(created_at, ctx: ReportContext) -> bool:
    return ctx.start <= analytics_service.business_date(created_at) <= ctx.end


# --- users (SENSITIVE: raw email, admin only, BR-88 exception) -----------------------------


def shape_users(users: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`users` rows: (user_id, email, created_at, is_verified, acquisition_channel)."""
    return [
        [email, created_at, yes_no(verified), channel_label(channel)]
        for _uid, email, created_at, verified, channel in users
        if _in_window(created_at, ctx)
    ]


async def build_users(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_users(await analytics_repo.user_rows(db), ctx)


register(
    ReportSpec(
        id="users",
        domain=DOMAIN,
        title="Báo cáo người dùng",
        description="Tài khoản đăng ký trong kỳ kèm email, ngày đăng ký, xác thực và kênh đến. "
        "Chứa email thật nên chỉ quản trị viên được xuất.",
        columns=(
            Column("Email"),
            Column("Ngày đăng ký", "date"),
            Column("Đã xác thực"),
            Column("Kênh đến"),
        ),
        build=build_users,
        sensitive=True,
        source_ref="BR-88",
    )
)


# --- channel-funnel (BR-107) ----------------------------------------------------------------


def shape_channel_funnel(
    users: Sequence[tuple], designers: Collection, paying: Collection, ctx: ReportContext
) -> list[list]:
    """BR-107: register -> verify email -> first saved design -> pay, per channel and week."""
    cells: dict = defaultdict(lambda: [0, 0, 0, 0])
    for user_id, _email, created_at, verified, channel in users:
        if not _in_window(created_at, ctx):
            continue
        day = analytics_service.business_date(created_at)
        week = (day - timedelta(days=day.weekday())).isoformat()
        cell = cells[(week, channel_label(channel))]
        cell[0] += 1
        cell[1] += bool(verified)
        cell[2] += user_id in designers
        cell[3] += user_id in paying
    return [
        [week, channel, *counts, counts[3] / counts[1] if counts[1] else None]
        for (week, channel), counts in sorted(cells.items())
    ]


async def build_channel_funnel(db: AsyncSession, ctx: ReportContext) -> list[list]:
    users = await analytics_repo.user_rows(db)
    designers = await analytics_repo.user_ids_with_saved_design(db)
    paying = set(
        analytics_service.by_user(
            analytics_service.build_payments(
                await analytics_repo.paid_invoice_rows(db), await analytics_repo.refund_rows(db)
            )
        )
    )
    return shape_channel_funnel(users, designers, paying, ctx)


register(
    ReportSpec(
        id="channel-funnel",
        domain=DOMAIN,
        title="Phễu theo kênh và tuần",
        description="Đăng ký, xác thực email, lưu thiết kế đầu tiên và thanh toán theo kênh đến "
        "và tuần (BR-107).",
        columns=(
            Column("Tuần (bắt đầu)"),
            Column("Kênh đến"),
            Column("Đăng ký", "int"),
            Column("Xác thực email", "int"),
            Column("Lưu thiết kế đầu", "int"),
            Column("Thanh toán", "int"),
            Column("Conversion (thanh toán ÷ xác thực)", "percent"),
        ),
        build=build_channel_funnel,
        source_ref="BR-107",
    )
)


# --- signups-daily --------------------------------------------------------------------------


def shape_signups_daily(users: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """`users` rows as `analytics_repo.user_rows`. One row per business day (GMT+7) and channel."""
    cells: dict = defaultdict(lambda: [0, 0])
    for _uid, _email, created_at, verified, channel in users:
        if not _in_window(created_at, ctx):
            continue
        cell = cells[(analytics_service.business_date(created_at), channel_label(channel))]
        cell[0] += 1
        cell[1] += bool(verified)
    return [
        [day, channel, signed, verified, verified / signed]
        for (day, channel), (signed, verified) in sorted(cells.items())
    ]


async def build_signups_daily(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_signups_daily(await analytics_repo.user_rows(db), ctx)


register(
    ReportSpec(
        id="signups-daily",
        domain=DOMAIN,
        title="Đăng ký theo ngày và kênh",
        description="Số tài khoản đăng ký mỗi ngày theo kênh đến, số đã xác thực email và tỷ lệ "
        "xác thực.",
        columns=(
            Column("Ngày", "date"),
            Column("Kênh đến"),
            Column("Đăng ký", "int"),
            Column("Đã xác thực", "int"),
            Column("% xác thực", "percent"),
        ),
        build=build_signups_daily,
        source_ref="BR-107",
    )
)


# --- utm-attribution ------------------------------------------------------------------------

UNKNOWN_UTM = "(không rõ)"


def _utm_key(source, medium, campaign) -> tuple[str, str, str]:
    """Case/whitespace-insensitive UTM triple; a missing part groups under UNKNOWN_UTM."""
    return tuple(
        (value or "").strip().lower() or UNKNOWN_UTM for value in (source, medium, campaign)
    )


def shape_utm_attribution(
    signups: Sequence[tuple], paid: Sequence[tuple], refunds: Sequence[tuple]
) -> list[list]:
    """`signups`: (user_id, source, medium, campaign). `paid`: first seven fields as
    `analytics_repo.paid_invoice_rows` then (source, medium, campaign), gross amounts.
    `refunds`: (invoice_id, user_id, amount, created_at). Revenue is netted per invoice."""
    cells: dict = defaultdict(lambda: {"signups": 0, "payers": set(), "revenue": 0})
    for _uid, source, medium, campaign in signups:
        cells[_utm_key(source, medium, campaign)]["signups"] += 1
    payments = analytics_service.build_payments([row[:7] for row in paid], refunds)
    keys = {row[0]: _utm_key(*row[7:10]) for row in paid}
    for payment in payments:
        cell = cells[keys[payment.invoice_id]]
        cell["payers"].add(payment.user_id)
        cell["revenue"] += payment.amount
    return [
        [*key, cell["signups"], len(cell["payers"]), cell["revenue"]]
        for key, cell in sorted(cells.items(), key=lambda item: (-item[1]["revenue"], item[0]))
    ]


async def build_utm_attribution(db: AsyncSession, ctx: ReportContext) -> list[list]:
    signups = await users_repo.signup_utm_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1)
    paid = await users_repo.utm_paid_invoice_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1)
    return shape_utm_attribution(signups, paid, await analytics_repo.refund_rows(db))


register(
    ReportSpec(
        id="utm-attribution",
        domain=DOMAIN,
        title="Hiệu quả theo UTM",
        description="Đăng ký, khách trả tiền và doanh thu thực thu (đã trừ hoàn tiền) theo bộ ba "
        "utm_source / utm_medium / utm_campaign. Đăng ký tính theo ngày tạo tài khoản, doanh thu "
        "theo ngày thanh toán trong kỳ.",
        columns=(
            Column("utm_source"),
            Column("utm_medium"),
            Column("utm_campaign"),
            Column("Đăng ký", "int"),
            Column("Khách trả tiền", "int"),
            Column("Doanh thu thuần", "vnd"),
        ),
        build=build_utm_attribution,
        source_ref="BR-107",
    )
)


# --- repeat-customers (BR-105) --------------------------------------------------------------


def shape_repeat_customers(
    paid: Sequence[tuple],
    refunds: Sequence[tuple],
    codes: dict,
    ctx: ReportContext,
) -> list[list]:
    """Paying customers with a plan payment in the window, judged on their whole payment history.
    `Quay lại?` = two or more payments at different moments; `Chưa đến kỳ?` = a single payment
    whose cycle has not ended at extraction time (excluded from the rate denominator, BR-105).
    The last row summarises the cohort."""
    payments = analytics_service.recurring_payments(analytics_service.build_payments(paid, refunds))
    listed = {
        user_id: history
        for user_id, history in analytics_service.by_user(payments).items()
        if any(_in_window(p.paid_at, ctx) for p in history)
    }
    rows = []
    for user_id, history in sorted(listed.items(), key=lambda item: codes.get(item[0], "")):
        flags = analytics_service.compute_repeat({user_id: history}, ctx.generated_at)
        rows.append(
            [
                codes.get(user_id, ""),
                len(history),
                analytics_service.business_date(history[0].paid_at),
                analytics_service.business_date(history[-1].paid_at),
                sum(p.amount for p in history),
                bool(flags.repeat_customers),
                bool(flags.not_yet_due),
                None,
            ]
        )
    cohort = analytics_service.compute_repeat(listed, ctx.generated_at)
    rows.append(["Tổng hợp", cohort.paying_customers, None, None, None, None, None, cohort.rate])
    return rows


async def build_repeat_customers(db: AsyncSession, ctx: ReportContext) -> list[list]:
    paid = await analytics_repo.paid_invoice_rows(db)
    refunds = await analytics_repo.refund_rows(db)
    payments = analytics_service.recurring_payments(analytics_service.build_payments(paid, refunds))
    in_window = {p.user_id for p in payments if _in_window(p.paid_at, ctx)}
    codes = await users_repo.account_codes(db, list(in_window))
    return shape_repeat_customers(paid, refunds, codes, ctx)


register(
    ReportSpec(
        id="repeat-customers",
        domain=DOMAIN,
        title="Khách hàng quay lại",
        description="Khách có thanh toán gói trong kỳ, số giao dịch, lần đầu và gần nhất, tổng "
        "thực trả, đã quay lại hay chưa đến kỳ gia hạn, kèm tỷ lệ quay lại toàn nhóm (BR-105). "
        "Định danh bằng mã khách, không dùng email.",
        columns=(
            Column("Mã khách"),
            Column("Số GD", "int"),
            Column("Lần đầu", "date"),
            Column("Gần nhất", "date"),
            Column("Tổng thực trả", "vnd"),
            Column("Quay lại?", "bool"),
            Column("Chưa đến kỳ?", "bool"),
            Column("Tỷ lệ quay lại", "percent"),
        ),
        build=build_repeat_customers,
        source_ref="BR-105",
    )
)
