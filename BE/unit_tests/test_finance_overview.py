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


# --- get_finance_overview with stubbed repositories ------------------------------------

NOW = datetime(2026, 3, 15, 5, 0, tzinfo=UTC)  # 12:00 on 2026-03-15 in GMT+7


def _stub(monkeypatch, *, paid=(), refunds=(), api=None, monthly=None, start_month=None):
    api = api or {}

    async def paid_rows(_db):
        return list(paid)

    async def refund_rows(_db):
        return list(refunds)

    async def first_cost_day(_db):
        return min(api) if api else None

    async def daily_costs(_db, *, start, end):
        return {d: c for d, c in api.items() if start <= d <= end}

    monkeypatch.setattr(fin.analytics_repo, "paid_invoice_rows", paid_rows)
    monkeypatch.setattr(fin.analytics_repo, "refund_rows", refund_rows)
    monkeypatch.setattr(fin.api_cost_repo, "first_cost_day", first_cost_day)
    monkeypatch.setattr(fin.api_cost_repo, "daily_costs", daily_costs)
    monkeypatch.setattr(fin.settings, "OPERATING_COST_MONTHLY_VND", monthly)
    monkeypatch.setattr(fin.settings, "OPERATING_COST_START_MONTH", start_month)


def _invoice(inv_id, paid_at, amount):
    return (inv_id, "user", paid_at, amount, "monthly", "pro_monthly", False)


async def test_overview_empty_ledger_is_all_zero(monkeypatch):
    _stub(monkeypatch)
    out = await fin.get_finance_overview(None, now=NOW)
    assert out.since is None
    assert out.maintenance.configured is False and out.maintenance.monthly_vnd is None
    assert out.totals.revenue_vnd == out.totals.total_cost_vnd == out.totals.profit_vnd == 0
    assert out.totals.profit_margin_rate is None
    assert len(out.series_1m) == 30 and len(out.series_6m) == 6
    assert all(p.revenue_vnd == p.profit_vnd == 0 for p in out.series_1m)


async def test_overview_combines_revenue_api_and_maintenance(monkeypatch):
    paid_at = datetime(2026, 2, 10, 3, 0, tzinfo=UTC)
    _stub(
        monkeypatch,
        paid=[_invoice("a", paid_at, 500_000), _invoice("b", paid_at, 300_000)],
        refunds=[("b", "user", 100_000, paid_at)],
        api={date(2026, 2, 12): 40_000, date(2026, 3, 1): 10_000},
        monthly=2_800_000,
        start_month=date(2026, 2, 1),
    )
    out = await fin.get_finance_overview(None, now=NOW)
    assert out.since == date(2026, 2, 1)
    assert out.maintenance.configured is True
    assert out.totals.revenue_vnd == 700_000  # refund netted
    assert out.totals.api_cost_vnd == 50_000
    # Feb in full (28/28) + 15 of 31 March days
    assert out.totals.maintenance_cost_vnd == 2_800_000 + 2_800_000 * 15 // 31
    assert out.totals.profit_vnd == out.totals.revenue_vnd - out.totals.total_cost_vnd
    assert out.current_month.revenue_vnd == 0
    assert out.current_month.api_cost_vnd == 10_000
    assert out.current_month.maintenance_cost_vnd == 2_800_000 * 15 // 31
    assert sum(p.revenue_vnd for p in out.series_6m) == out.totals.revenue_vnd


async def test_overview_unset_start_month_means_not_configured(monkeypatch):
    _stub(monkeypatch, api={date(2026, 3, 2): 5_000}, monthly=1_000_000, start_month=None)
    out = await fin.get_finance_overview(None, now=NOW)
    assert out.maintenance.configured is False
    assert out.totals.maintenance_cost_vnd == 0
    assert out.totals.profit_vnd == -5_000
    assert out.since == date(2026, 3, 2)


# --- route -----------------------------------------------------------------------------


async def test_route_returns_contract_shape(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from httpx import ASGITransport, AsyncClient

    from app.dependencies import get_current_admin, get_db
    from app.main import app

    _stub(monkeypatch, api={date(2026, 3, 2): 5_000}, monthly=1_000_000, start_month=date(2026, 3, 1))
    app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id="a", role="admin")
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/admin/dashboard/finance")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "as_of", "since", "totals", "current_month", "maintenance", "series_1m", "series_6m",
    }
    assert body["maintenance"]["configured"] is True
    assert body["totals"]["revenue_vnd"] == 0
    assert body["totals"]["contribution_margin_rate"] is None
    assert body["totals"]["profit_vnd"] == -(body["totals"]["total_cost_vnd"])
    assert {"period_start", "revenue_vnd", "api_cost_vnd", "maintenance_cost_vnd", "profit_vnd"} == set(
        body["series_1m"][0]
    )
