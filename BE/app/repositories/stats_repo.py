"""Aggregate queries cho admin dashboard & system health.

Tập trung mọi func.count/sum/date_trunc tại đây — giữ entity repos thuần CRUD.
"""
from datetime import date

from sqlalchemy import Row, case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bake_job import BakeJob
from app.models.export_record import ExportRecord
from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User

_MONTHLY_MRR = case(
    (Plan.billing_cycle == "yearly", Plan.price_vnd / 12),
    else_=Plan.price_vnd,
)


async def count_users(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(User).where(
            User.role == "user", User.deleted_at.is_(None)
        )
    )
    return result.scalar() or 0


async def current_mrr_vnd(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(_MONTHLY_MRR), 0))
        .select_from(Subscription)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "active", Subscription.tier != "free")
    )
    return int(result.scalar() or 0)


async def count_exports(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(ExportRecord))
    return result.scalar() or 0


async def revenue_by_month(db: AsyncSession, *, months: int) -> list[tuple[date, int]]:
    month_bucket = func.date_trunc("month", Invoice.paid_at)
    window_start = func.date_trunc("month", func.now()) - text(
        f"INTERVAL '{int(months) - 1} months'"
    )
    result = await db.execute(
        select(month_bucket.label("m"), func.sum(Invoice.amount_vnd))
        .where(Invoice.status == "paid", Invoice.paid_at >= window_start)
        .group_by("m")
        .order_by("m")
    )
    return [(row[0].date(), int(row[1])) for row in result.all()]


async def new_users_by_month(db: AsyncSession, *, months: int) -> list[tuple[date, int]]:
    # Bao gồm soft-deleted: signup là sự kiện lịch sử, không rewrite quá khứ khi user xóa tài khoản
    month_bucket = func.date_trunc("month", User.created_at)
    window_start = func.date_trunc("month", func.now()) - text(
        f"INTERVAL '{int(months) - 1} months'"
    )
    result = await db.execute(
        select(month_bucket.label("m"), func.count())
        .where(User.role == "user", User.created_at >= window_start)
        .group_by("m")
        .order_by("m")
    )
    return [(row[0].date(), int(row[1])) for row in result.all()]


async def recent_users_with_plan(db: AsyncSession, *, limit: int) -> list[Row]:
    result = await db.execute(
        select(
            User.id,
            User.email,
            User.username,
            User.status,
            User.created_at,
            Subscription.tier.label("plan_tier"),
            func.coalesce(_MONTHLY_MRR, 0).label("mrr_vnd"),
        )
        .select_from(User)
        .outerjoin(Subscription, Subscription.user_id == User.id)
        .outerjoin(Plan, Plan.id == Subscription.plan_id)
        .where(User.role == "user", User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .limit(limit)
    )
    return list(result.all())


async def count_bake_jobs_by_status(db: AsyncSession) -> dict[str, int]:
    result = await db.execute(
        select(BakeJob.status, func.count()).group_by(BakeJob.status)
    )
    return {row[0]: row[1] for row in result.all()}


async def db_ping(db: AsyncSession) -> bool:
    await db.execute(text("SELECT 1"))
    return True
