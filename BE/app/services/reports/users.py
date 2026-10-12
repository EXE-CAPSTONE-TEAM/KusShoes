"""Reports hub domain `nguoi-dung` -- Người dùng: users (sensitive), signups-daily, channel-funnel,
utm-attribution, repeat-customers.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections import defaultdict
from collections.abc import Collection, Sequence
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import analytics_repo
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
