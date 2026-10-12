"""Pure maths behind the admin finance dashboard (no database)."""

from datetime import UTC, date, datetime

import pytest

from app.services import finance_overview_service as fin
from app.services.analytics_service import Payment

MONTHLY = 3_100_000
START = date(2026, 1, 1)


def _payment(paid_at: datetime, amount: int) -> Payment:
    return Payment("inv", "user", paid_at, amount, "monthly", "pro_monthly", False)


def test_accrue_full_month_equals_monthly():
    assert fin.accrue_maintenance(date(2026, 3, 1), date(2026, 3, 31), MONTHLY, START) == MONTHLY


def test_accrue_prorates_by_days_in_month():
    # February 2026 has 28 days: 14 of them is half the monthly cost
    assert fin.accrue_maintenance(date(2026, 2, 1), date(2026, 2, 14), 2_800_000, START) == 1_400_000


def test_accrue_spans_months_independently():
    cross = fin.accrue_maintenance(date(2026, 3, 30), date(2026, 4, 2), MONTHLY, START)
    parts = fin.accrue_maintenance(
        date(2026, 3, 30), date(2026, 3, 31), MONTHLY, START
    ) + fin.accrue_maintenance(date(2026, 4, 1), date(2026, 4, 2), MONTHLY, START)
    assert cross == parts > 0


def test_accrue_zero_before_start_month_and_when_unconfigured():
    assert fin.accrue_maintenance(date(2025, 6, 1), date(2025, 12, 31), MONTHLY, START) == 0
    assert fin.accrue_maintenance(date(2026, 3, 1), date(2026, 3, 31), None, START) == 0
    assert fin.accrue_maintenance(date(2026, 3, 1), date(2026, 3, 31), MONTHLY, None) == 0


def test_accrue_only_counts_months_from_start_month():
    # range straddles the start month boundary: only the billed part accrues
    straddle = fin.accrue_maintenance(date(2025, 12, 31), date(2026, 1, 1), MONTHLY, START)
    assert straddle == fin.accrue_maintenance(date(2026, 1, 1), date(2026, 1, 1), MONTHLY, START)
    assert 0 < straddle < MONTHLY


def test_accrue_empty_range():
    assert fin.accrue_maintenance(date(2026, 3, 5), date(2026, 3, 4), MONTHLY, START) == 0


@pytest.mark.parametrize("month", [date(2026, m, 1) for m in range(1, 13)] + [date(2028, 2, 1)])
@pytest.mark.parametrize("monthly", [0, 1, 999_999, 3_100_000])
def test_accrue_full_month_never_exceeds_monthly(month, monthly):
    last = month.replace(day=fin._days_in_month(month))
    assert 0 <= fin.accrue_maintenance(month, last, monthly, START) <= monthly


def test_totals_profit_can_be_negative_and_rates_follow():
    totals = fin.build_totals(revenue=1_000_000, api_cost=200_000, maintenance=1_300_000)
    assert totals.total_cost_vnd == totals.api_cost_vnd + totals.maintenance_cost_vnd
    assert totals.profit_vnd == totals.revenue_vnd - totals.total_cost_vnd < 0
    assert totals.contribution_margin_vnd == totals.revenue_vnd - totals.api_cost_vnd
    assert totals.contribution_margin_rate == pytest.approx(
        totals.contribution_margin_vnd / totals.revenue_vnd
    )
    assert totals.profit_margin_rate is not None and totals.profit_margin_rate < 0


def test_rates_are_null_without_revenue():
    totals = fin.build_totals(revenue=0, api_cost=5_000, maintenance=0)
    assert totals.contribution_margin_rate is None
    assert totals.profit_margin_rate is None
    assert totals.profit_vnd == -5_000


def test_revenue_bucketed_by_gmt7_date():
    # 18:00 UTC on the 31st is 01:00 on the 1st in GMT+7
    late = _payment(datetime(2026, 3, 31, 18, 0, tzinfo=UTC), 100)
    early = _payment(datetime(2026, 3, 31, 16, 59, tzinfo=UTC), 40)
    table = fin.revenue_by_day([late, early])
    assert table == {date(2026, 4, 1): 100, date(2026, 3, 31): 40}


def test_daily_points_window_is_contiguous_and_ends_today():
    today = date(2026, 3, 15)
    points = fin.daily_points(today, 30, {today: 500}, {today: 200}, MONTHLY, START)
    assert len(points) == 30
    assert points[-1].period_start == today
    steps = {(b.period_start - a.period_start).days for a, b in zip(points, points[1:])}
    assert steps == {1}
    last = points[-1]
    assert last.profit_vnd == last.revenue_vnd - last.api_cost_vnd - last.maintenance_cost_vnd


def test_monthly_points_cover_year_boundary_and_clip_current_month():
    today = date(2026, 2, 10)
    points = fin.monthly_points(today, 6, {}, {}, MONTHLY, START)
    assert [p.period_start for p in points] == [
        date(2025, 9, 1),
        date(2025, 10, 1),
        date(2025, 11, 1),
        date(2025, 12, 1),
        date(2026, 1, 1),
        date(2026, 2, 1),
    ]
    assert points[0].maintenance_cost_vnd == 0  # before the start month
    assert points[4].maintenance_cost_vnd == MONTHLY  # full January
    assert 0 < points[5].maintenance_cost_vnd < MONTHLY  # February accrued to the 10th only


def test_series_totals_agree_with_range_sums():
    today = date(2026, 3, 31)
    revenue = {date(2026, 3, 2): 700, date(2026, 3, 20): 300}
    api = {date(2026, 3, 2): 50}
    month = fin.monthly_points(today, 1, revenue, api, MONTHLY, START)[0]
    assert month.revenue_vnd == 1000
    assert month.api_cost_vnd == 50
    assert month.maintenance_cost_vnd == MONTHLY


def test_earliest_ignores_missing():
    assert fin.earliest(None, None) is None
    assert fin.earliest(date(2026, 5, 1), None, date(2026, 2, 1)) == date(2026, 2, 1)
