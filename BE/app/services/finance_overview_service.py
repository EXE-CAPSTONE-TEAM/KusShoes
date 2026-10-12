"""Admin finance dashboard: revenue, API cost, fixed upkeep cost and profit.

The maths are plain functions over lightweight inputs so each definition can be unit-tested
without a database. Revenue reuses `analytics_service.build_payments` (internal accounts dropped,
refunds netted) bucketed by GMT+7 payment date; API cost is the `api_cost_entries` ledger
(internal accounts included, they cost real money); fixed upkeep is accrued per calendar month
from the Finance-supplied settings. Marketing spend is not in the model (sổ 08)."""

import calendar
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from app.schemas.finance_overview import FinancePoint, FinanceTotals
from app.services.analytics_service import Payment, business_date


def _days_in_month(day: date) -> int:
    return calendar.monthrange(day.year, day.month)[1]


def month_start(day: date) -> date:
    return day.replace(day=1)


def _next_month(day: date) -> date:
    return date(day.year + day.month // 12, day.month % 12 + 1, 1)


def _shift_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def accrue_maintenance(start: date, end: date, monthly: int | None, start_month: date | None) -> int:
    """Fixed upkeep for the days start..end (inclusive): each calendar month overlapping the
    range adds monthly * overlap_days // days_in_month. Months before `start_month`, or an
    unconfigured cost, accrue nothing."""
    if monthly is None or start_month is None or end < start:
        return 0
    first_billed = month_start(start_month)
    total = 0
    cursor = month_start(start)
    while cursor <= end:
        if cursor >= first_billed:
            month_last = cursor.replace(day=_days_in_month(cursor))
            overlap = (min(end, month_last) - max(start, cursor)).days + 1
            total += monthly * overlap // _days_in_month(cursor)
        cursor = _next_month(cursor)
    return total


def revenue_by_day(payments: Iterable[Payment]) -> dict[date, int]:
    """Net payment amounts per GMT+7 business day."""
    table: dict[date, int] = defaultdict(int)
    for payment in payments:
        table[business_date(payment.paid_at)] += payment.amount
    return dict(table)


def rate(numerator: int, denominator: int) -> float | None:
    """numerator / denominator, None when there is no revenue to divide by."""
    return numerator / denominator if denominator > 0 else None


def sum_range(by_day: dict[date, int], start: date, end: date) -> int:
    return sum(value for day, value in by_day.items() if start <= day <= end)


def build_totals(revenue: int, api_cost: int, maintenance: int) -> FinanceTotals:
    total_cost = api_cost + maintenance
    profit = revenue - total_cost
    contribution = revenue - api_cost
    return FinanceTotals(
        revenue_vnd=revenue,
        api_cost_vnd=api_cost,
        maintenance_cost_vnd=maintenance,
        total_cost_vnd=total_cost,
        profit_vnd=profit,
        contribution_margin_vnd=contribution,
        contribution_margin_rate=rate(contribution, revenue),
        profit_margin_rate=rate(profit, revenue),
    )


def build_point(
    start: date,
    end: date,
    revenue_days: dict[date, int],
    api_days: dict[date, int],
    monthly: int | None,
    start_month: date | None,
) -> FinancePoint:
    revenue = sum_range(revenue_days, start, end)
    api_cost = sum_range(api_days, start, end)
    maintenance = accrue_maintenance(start, end, monthly, start_month)
    return FinancePoint(
        period_start=start,
        revenue_vnd=revenue,
        api_cost_vnd=api_cost,
        maintenance_cost_vnd=maintenance,
        profit_vnd=revenue - api_cost - maintenance,
    )


def daily_points(
    today: date,
    days: int,
    revenue_days: dict[date, int],
    api_days: dict[date, int],
    monthly: int | None,
    start_month: date | None,
) -> list[FinancePoint]:
    """`days` consecutive business days ending today, oldest first."""
    first = today - timedelta(days=days - 1)
    return [
        build_point(day, day, revenue_days, api_days, monthly, start_month)
        for day in (first + timedelta(days=offset) for offset in range(days))
    ]


def monthly_points(
    today: date,
    months: int,
    revenue_days: dict[date, int],
    api_days: dict[date, int],
    monthly: int | None,
    start_month: date | None,
) -> list[FinancePoint]:
    """`months` calendar months ending with the current one (accrued up to today), oldest first."""
    points = []
    for back in range(months - 1, -1, -1):
        first = _shift_months(month_start(today), -back)
        last = min(first.replace(day=_days_in_month(first)), today)
        points.append(build_point(first, last, revenue_days, api_days, monthly, start_month))
    return points


def earliest(*days: date | None) -> date | None:
    present = [day for day in days if day is not None]
    return min(present) if present else None
