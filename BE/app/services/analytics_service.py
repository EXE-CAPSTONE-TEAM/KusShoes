"""SRS §5.4 business metrics (BR-104/105/83/103).

The metric maths are plain functions over lightweight row tuples so each
definition can be unit-tested without a database. Internal accounts are
dropped by the repository; COMP has no invoice so it never reaches revenue."""

import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import analytics_repo
from app.schemas.analytics import (
    AnalyticsResponse,
    ChurnMetric,
    FailedPayments,
    MrrMovement,
    PeriodValue,
    PlanRevenue,
    RateMetric,
    RepeatMetric,
    RetentionMetric,
    RevenuePoint,
    TopCustomer,
)
from app.services.period_service import GMT7

GRACE_DAYS = 3


@dataclass(frozen=True)
class Payment:
    invoice_id: object
    user_id: object
    paid_at: datetime
    amount: int  # net of refunds
    billing_cycle: str
    plan_tier: str
    is_upgrade: bool


def month_key(moment: datetime) -> str:
    local = moment.astimezone(GMT7)
    return f"{local.year:04d}-{local.month:02d}"


def business_date(moment: datetime) -> date:
    return moment.astimezone(GMT7).date()


def add_months(moment: datetime, months: int) -> datetime:
    """Same day next month, clamped to the last day (BR-23), ending 23:59:59 GMT+7."""
    local = moment.astimezone(GMT7)
    index = local.month - 1 + months
    year, month = local.year + index // 12, index % 12 + 1
    day = min(local.day, calendar.monthrange(year, month)[1])
    return datetime(year, month, day, 23, 59, 59, tzinfo=GMT7)


def cycle_end(payment: Payment) -> datetime:
    return add_months(payment.paid_at, 12 if payment.billing_cycle == "yearly" else 1)


def build_payments(paid_rows: list[tuple], refund_rows: list[tuple]) -> list[Payment]:
    """Net each invoice by its refund ledger entries; fully refunded ones drop out (BR-97)."""
    refunded: dict = defaultdict(int)
    for invoice_id, _user_id, amount, _created_at in refund_rows:
        refunded[invoice_id] += amount
    payments = []
    for row in paid_rows:
        invoice_id, user_id, paid_at, amount, cycle, tier, is_upgrade = row[:7]
        net = amount - refunded.get(invoice_id, 0)
        if net > 0 and paid_at is not None:
            payments.append(Payment(invoice_id, user_id, paid_at, net, cycle, tier, is_upgrade))
    return payments


def by_user(payments: list[Payment]) -> dict:
    grouped: dict = defaultdict(list)
    for payment in payments:
        grouped[payment.user_id].append(payment)
    for items in grouped.values():
        items.sort(key=lambda p: p.paid_at)
    return grouped


def monthly_revenue_by_user(payments: list[Payment]) -> dict[object, dict[str, int]]:
    table: dict = defaultdict(lambda: defaultdict(int))
    for payment in payments:
        table[payment.user_id][month_key(payment.paid_at)] += payment.amount
    return table


def previous_month(key: str) -> str:
    year, month = int(key[:4]), int(key[5:])
    return f"{year - 1:04d}-12" if month == 1 else f"{year:04d}-{month - 1:02d}"


def compute_mrr(user_payments: dict, subscriptions: list[tuple]) -> int:
    """ACTIVE/GRACE paid, non-COMP subscriptions, valued at the
    customer's latest actual payment normalised to one month."""
    total = 0
    for user_id, tier, status, is_comp in subscriptions:
        if tier == "free" or is_comp or status not in ("active", "grace"):
            continue
        history = user_payments.get(user_id)
        if not history:
            continue
        latest = history[-1]
        total += latest.amount // 12 if latest.billing_cycle == "yearly" else latest.amount
    return total


def compute_churn(user_payments: dict, start: date, end: date) -> ChurnMetric:
    """SRS churn: customers whose plan came due in the period and did not renew
    before grace ended ÷ customers due in the period. A later payment made
    before the cycle ended (an upgrade) restarts the cycle, so it is not a due event."""
    due = churned = 0
    for history in user_payments.values():
        for index, payment in enumerate(history):
            ends = cycle_end(payment)
            if not start <= ends.date() <= end:
                continue
            following = history[index + 1].paid_at if index + 1 < len(history) else None
            if following is not None and following <= ends:
                continue  # superseded mid-cycle
            due += 1
            if following is None or following > ends + timedelta(days=GRACE_DAYS):
                churned += 1
    return ChurnMetric(due=due, churned=churned, rate=_ratio(churned, due))


def compute_retention(monthly: dict, month: str) -> RetentionMetric:
    """NRR/GRR month over month: cash from last month's payers, this month vs last."""
    prior = previous_month(month)
    base = expansion_base = kept = 0
    for months in monthly.values():
        before = months.get(prior, 0)
        if before <= 0:
            continue
        now = months.get(month, 0)
        base += before
        expansion_base += now
        kept += min(now, before)
    return RetentionMetric(
        month=month,
        nrr=_ratio(expansion_base, base),
        grr=_ratio(kept, base),
    )


def compute_movement(monthly: dict, month: str) -> MrrMovement:
    """Cash-based movement between two consecutive months (approximation of MRR movement)."""
    prior = previous_month(month)
    new = expansion = reactivation = contraction = churn = 0
    for months in monthly.values():
        before, now = months.get(prior, 0), months.get(month, 0)
        if before == 0 and now > 0:
            if any(key < month and value > 0 for key, value in months.items()):
                reactivation += now
            else:
                new += now
        elif before > 0 and now == 0:
            churn += before
        elif now > before > 0:
            expansion += now - before
        elif 0 < now < before:
            contraction += before - now
    return MrrMovement(
        month=month,
        new=new,
        expansion=expansion,
        reactivation=reactivation,
        contraction=contraction,
        churn=churn,
        net_new=new + expansion + reactivation - contraction - churn,
    )


def compute_repeat(user_payments: dict, now: datetime) -> RepeatMetric:
    """BR-105: ≥2 payments at different moments ÷ paying customers; customers with a
    single payment whose cycle has not ended yet are not yet due and reported apart."""
    paying = repeat = not_yet_due = 0
    for history in user_payments.values():
        paying += 1
        moments = {item.paid_at for item in history}
        if len(moments) >= 2:
            repeat += 1
        elif cycle_end(history[0]) > now:
            not_yet_due += 1
    return RepeatMetric(
        paying_customers=paying,
        repeat_customers=repeat,
        not_yet_due=not_yet_due,
        rate=_ratio(repeat, paying - not_yet_due),
        raw_rate=_ratio(repeat, paying),
    )


def _ratio(numerator: int | float, denominator: int | float) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _in_range(moment: datetime, start: date, end: date) -> bool:
    return start <= business_date(moment) <= end


def _sum_in(payments: list[Payment], start: date, end: date) -> int:
    return sum(p.amount for p in payments if _in_range(p.paid_at, start, end))


def _first_payment_in(user_payments: dict, start: date, end: date) -> int:
    return sum(
        1 for history in user_payments.values() if _in_range(history[0].paid_at, start, end)
    )


async def get_analytics(
    db: AsyncSession, *, date_from: date | None = None, date_to: date | None = None
) -> AnalyticsResponse:
    now = datetime.now(UTC)
    end = date_to or business_date(now)
    start = date_from or end - timedelta(days=29)
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)

    paid_rows = await analytics_repo.paid_invoice_rows(db)
    refund_rows = await analytics_repo.refund_rows(db)
    payments = build_payments(paid_rows, refund_rows)
    user_payments = by_user(payments)
    monthly = monthly_revenue_by_user(payments)
    subscriptions = await analytics_repo.subscription_rows(db)
    users = await analytics_repo.user_rows(db)

    mrr = compute_mrr(user_payments, subscriptions)
    paying = len(user_payments)

    gross = {
        "cur": sum(row[3] for row in paid_rows if _in_range(row[2], start, end)),
        "prev": sum(row[3] for row in paid_rows if _in_range(row[2], prev_start, prev_end)),
    }
    refunds = {
        "cur": sum(r[2] for r in refund_rows if _in_range(r[3], start, end)),
        "prev": sum(r[2] for r in refund_rows if _in_range(r[3], prev_start, prev_end)),
    }
    # Recognised revenue = actual paid − refund entries, on the payment date (§5.4).
    revenue = PeriodValue(
        current=gross["cur"] - refunds["cur"], previous=gross["prev"] - refunds["prev"]
    )

    verified = sum(1 for user in users if user[3])
    converted = sum(1 for user in users if user[0] in user_payments)

    failed_since = now - timedelta(days=30)
    failed = await analytics_repo.failed_invoice_rows(db, since=failed_since)

    by_plan: dict[str, int] = defaultdict(int)
    for payment in payments:
        if _in_range(payment.paid_at, start, end):
            by_plan[payment.plan_tier] += payment.amount
    plan_total = sum(by_plan.values())

    series: dict[str, int] = defaultdict(int)
    for payment in payments:
        series[month_key(payment.paid_at)] += payment.amount

    emails = {user[0]: user[1] for user in users}
    totals = sorted(
        (
            (sum(p.amount for p in history), len(history), user_id)
            for user_id, history in user_payments.items()
        ),
        reverse=True,
    )[:10]

    month = month_key(datetime(end.year, end.month, end.day, 12, tzinfo=GMT7))
    return AnalyticsResponse(
        date_from=start,
        date_to=end,
        mrr_vnd=mrr,
        arr_vnd=mrr * 12,
        arpu_vnd=mrr // paying if paying else 0,
        paying_customers=paying,
        revenue_vnd=revenue,
        refunds_vnd=PeriodValue(current=refunds["cur"], previous=refunds["prev"]),
        new_paying_customers=PeriodValue(
            current=_first_payment_in(user_payments, start, end),
            previous=_first_payment_in(user_payments, prev_start, prev_end),
        ),
        churn=compute_churn(user_payments, start, end),
        retention=compute_retention(monthly, month),
        free_to_paid=RateMetric(
            numerator=converted, denominator=verified, rate=_ratio(converted, verified)
        ),
        repeat=compute_repeat(user_payments, now),
        failed_payments=FailedPayments(
            count_30d=len(failed), amount_30d_vnd=sum(row[1] for row in failed)
        ),
        revenue_by_plan=[
            PlanRevenue(plan_tier=tier, revenue_vnd=value, share=_ratio(value, plan_total) or 0)
            for tier, value in sorted(by_plan.items(), key=lambda item: -item[1])
        ],
        revenue_series=[
            RevenuePoint(month=key, revenue_vnd=value) for key, value in sorted(series.items())
        ],
        mrr_movement=compute_movement(monthly, month),
        top_customers=[
            TopCustomer(user_id=user_id, email=emails.get(user_id), net_paid_vnd=total, orders=n)
            for total, n, user_id in totals
        ],
    )
