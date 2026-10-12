"""Reports hub domain chi-phi-he-thong: pure shape() seams, no database."""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import api_cost_service
from app.services.period_service import GMT7
from app.services.reports import ops, registry
from app.services.reports.registry import ReportContext

IDS = ["api-cost", "api-cost-by-operation", "api-cost-by-user", "api-budget", "scan-unit-economics"]


def _ctx(start: date, end: date) -> ReportContext:
    start_utc = datetime(start.year, start.month, start.day, tzinfo=GMT7).astimezone(UTC)
    end_next = end + timedelta(days=1)
    end_utc = datetime(end_next.year, end_next.month, end_next.day, tzinfo=GMT7).astimezone(UTC)
    return ReportContext(
        start=start,
        end=end,
        start_utc=start_utc,
        end_utc=end_utc,
        generated_at=datetime.now(GMT7),
        actor_role="admin",
        max_rows=1000,
    )


def test_domain_registers_five_specs_and_only_budget_has_pdf():
    specs = {s.id: s for s in registry.all_specs() if s.domain == ops.DOMAIN}
    assert set(specs) == set(IDS)
    assert [i for i, s in specs.items() if "pdf" in s.formats] == ["api-budget"]


def test_row_width_matches_columns_for_every_shape():
    specs = {s.id: s for s in registry.all_specs()}
    day = date(2026, 3, 1)
    ctx = _ctx(day, day)
    samples = {
        "api-cost-by-operation": ops.shape_by_operation([("p", "o", 3, 2, 90)]),
        "api-cost-by-user": ops.shape_by_user([("KS1", False, "free", 1, 1, 5)]),
        "api-budget": ops.shape_budget(
            [
                SimpleNamespace(
                    period_month=day,
                    budget_vnd=None,
                    spent_vnd=0,
                    percent=None,
                    state="unconfigured",
                    warned_at=None,
                    suspended_at=None,
                )
            ]
        ),
        "scan-unit-economics": ops.shape_scan_economics([], [], ctx),
    }
    for report_id, table in samples.items():
        assert table and all(len(r) == len(specs[report_id].columns) for r in table), report_id


def test_by_operation_shares_sum_to_one_and_total_row_reconciles():
    rows = [("gemini", "image", 10, 8, 300), ("meshy", "scan_3d", 4, 4, 700), ("x", "y", 1, 0, 0)]
    table = ops.shape_by_operation(rows)
    body, total = table[:-1], table[-1]
    assert sum(r[7] for r in body) == pytest.approx(1.0)
    assert total[5] == sum(r[5] for r in body) == 1000
    assert total[2] == sum(r[2] for r in body)
    assert [r[4] for r in body] == [2, 0, 1]  # failed = calls - ok
    assert body[1][6] == pytest.approx(175)  # average cost per call


def test_by_operation_zero_cost_has_blank_shares_not_division_error():
    table = ops.shape_by_operation([("p", "o", 2, 2, 0)])
    assert table[0][7] is None and table[-1][7] is None
    assert ops.shape_by_operation([])[-1][6] is None  # no calls -> blank average


def test_by_user_flags_internal_and_labels_orphan_calls():
    table = ops.shape_by_user(
        [("KS0001", True, "pro_monthly", 12, 10, 900), (None, False, None, 3, 0, 40)]
    )
    assert table[0][1] is True  # internal accounts stay in the report, flagged
    assert table[1][0] == ops.NO_USER_LABEL and table[1][2] == ""
    assert "@" not in "".join(str(c) for row in table for c in row)  # BR-88: no emails
    assert sum(r[5] for r in table) == 940


def _status(spent, budget):
    percent = spent * 100 / budget if budget else None
    return SimpleNamespace(
        period_month=date(2026, 3, 1),
        budget_vnd=budget,
        spent_vnd=spent,
        percent=percent,
        state=api_cost_service.budget_state(spent, budget),
        warned_at=None,
        suspended_at=None,
    )


def test_budget_percent_is_fraction_blank_when_unconfigured():
    unconfigured = ops.shape_budget([_status(500, None)])[0]
    assert unconfigured[3] is None and unconfigured[1] is None
    assert unconfigured[4] == ops.BUDGET_STATE_LABELS["unconfigured"]
    half = ops.shape_budget([_status(500, 1000)])[0]
    assert half[3] == pytest.approx(0.5)


def test_budget_state_flips_exactly_at_configured_thresholds():
    budget = 10_000
    warn = budget * settings.API_BUDGET_WARN_PERCENT // 100
    stop = budget * settings.API_BUDGET_SUSPEND_PERCENT // 100
    states = [
        ops.shape_budget([_status(s, budget)])[0][4] for s in (warn - 1, warn, stop - 1, stop)
    ]
    labels = ops.BUDGET_STATE_LABELS
    assert states == [labels["ok"], labels["warning"], labels["warning"], labels["suspended"]]
    assert (
        ops.shape_budget([_status(stop, budget)])[0][3] >= settings.API_BUDGET_SUSPEND_PERCENT / 100
    )


@pytest.mark.parametrize(
    ("start", "end", "count"),
    [
        (date(2026, 3, 31), date(2026, 3, 31), 1),
        (date(2026, 1, 31), date(2026, 3, 1), 3),  # Jan, Feb, Mar
        (date(2025, 12, 15), date(2026, 1, 2), 2),  # year rollover
    ],
)
def test_months_in_range_lists_each_touched_month_once(start, end, count):
    months = ops.months_in_range(start, end)
    assert len(months) == count and all(m.day == 1 for m in months)
    assert months == sorted(set(months))


def _at(day, hour=10):
    return datetime(day.year, day.month, day.day, hour, tzinfo=GMT7).astimezone(UTC)


def test_scan_economics_cost_per_ok_blank_with_zero_ok_scans_and_zero_filled_days():
    d1, d2, d3 = date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 3)
    ctx = _ctx(d1, d3)
    table = ops.shape_scan_economics([(d1, 4, 1, 500), (d2, 0, 3, 120)], [], ctx)
    assert [r[0] for r in table[:-1]] == [d1, d2, d3]
    assert table[0][4] == pytest.approx(125)  # 500 / 4 OK scans
    assert table[1][4] is None  # failed calls cost money but there is no OK scan to divide by
    assert table[1][3] == 120
    assert table[2][1:] == [0, 0, 0, None, 0, 0, 0, 0]
    total = table[-1]
    assert total[0] == "Tổng" and total[3] == 620 and total[4] == pytest.approx(155)


def test_scan_economics_credits_bucketed_by_gmt7_day_and_window():
    d1, d2 = date(2026, 3, 1), date(2026, 3, 2)
    ctx = _ctx(d1, d2)
    late_night_utc = datetime(2026, 3, 1, 18, 30, tzinfo=UTC)  # 01:30 GMT+7 on 2 March
    credits = [
        (late_night_utc, None, _at(date(2026, 4, 1)), "available", 30_000),
        (_at(date(2026, 2, 20)), _at(d1), _at(date(2026, 4, 1)), "used", 30_000),
        (_at(date(2026, 1, 1)), None, _at(d2), "expired", 30_000),
        (_at(date(2026, 2, 1)), None, _at(d2), "revoked", 30_000),  # not 'expired'
    ]
    table = ops.shape_scan_economics([], credits, ctx)
    sold, used, expired, revenue = 5, 6, 7, 8
    assert table[0][sold] == 0 and table[1][sold] == 1  # bought 01:30 GMT+7 on the 2nd
    assert table[1][revenue] == 30_000 and table[0][revenue] == 0
    assert table[0][used] == 1 and table[1][used] == 0
    assert table[0][expired] == 0 and table[1][expired] == 1
    total = table[-1]
    assert (total[sold], total[used], total[expired], total[revenue]) == (1, 1, 1, 30_000)
