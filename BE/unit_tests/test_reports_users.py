"""RP-6: nguoi-dung reports (signups-daily, utm-attribution, repeat-customers). Shapers are pure,
so they run on hand-built rows with behavioural / boundary assertions."""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.services import reports
from app.services.period_service import GMT7
from app.services.reports import registry, users

NOW = datetime(2026, 6, 15, 12, 0, tzinfo=GMT7)


def _ctx(start=date(2026, 3, 1), end=date(2026, 3, 31), now=NOW):
    return reports.build_context(
        SimpleNamespace(date_scoped=True, max_range_days=None), "admin", start, end, now=now
    )


def _user(day, hour=10, verified=True, channel="tiktok"):
    return (uuid4(), "x@example.com", datetime(2026, 3, day, hour, tzinfo=GMT7), verified, channel)


# --- registration ---------------------------------------------------------------------------


def test_three_new_reports_registered_in_domain_non_sensitive():
    for report_id in ("signups-daily", "utm-attribution", "repeat-customers"):
        spec = registry.get(report_id)
        assert spec.domain == "nguoi-dung"
        assert not spec.sensitive
    assert [s.id for s in registry.all_specs() if s.domain == "nguoi-dung"].count("users") == 1


# --- signups-daily --------------------------------------------------------------------------


def test_signups_split_sums_and_rate_bounds():
    rows = users.shape_signups_daily(
        [_user(5), _user(5, verified=False), _user(5, verified=False), _user(6, channel="email")],
        _ctx(),
    )
    assert sum(r[2] for r in rows) == 4
    for _day, _channel, signed, verified, rate in rows:
        assert 0 <= verified <= signed
        assert rate == pytest.approx(verified / signed)
        assert 0 <= rate <= 1
    tiktok = next(r for r in rows if r[1] == "TikTok")
    assert tiktok[2:4] == [3, 1]


def test_signups_use_gmt7_business_day_and_inclusive_window():
    # 2026-03-31 18:00 UTC is 01:00 on 1 April in GMT+7 -> outside March.
    late_utc = (uuid4(), "e", datetime(2026, 3, 31, 18, tzinfo=UTC), True, "direct")
    # 2026-02-28 17:30 UTC is 00:30 on 1 March in GMT+7 -> inside.
    early_utc = (uuid4(), "e", datetime(2026, 2, 28, 17, 30, tzinfo=UTC), True, "direct")
    rows = users.shape_signups_daily([late_utc, early_utc], _ctx())
    assert [r[0] for r in rows] == [date(2026, 3, 1)]


def test_signups_unknown_channel_grouped_and_empty_input():
    rows = users.shape_signups_daily([_user(2, channel=None), _user(2, channel="weird")], _ctx())
    assert len(rows) == 1 and rows[0][2] == 2
    assert users.shape_signups_daily([], _ctx()) == []


# --- utm-attribution ------------------------------------------------------------------------


def _paid(uid, invoice_id, amount, utm=("fb", "cpc", "sale"), tier="pro", day=10):
    paid_at = datetime(2026, 3, day, 9, tzinfo=GMT7)
    return (invoice_id, uid, paid_at, amount, "monthly", tier, False, *utm)


def test_utm_revenue_is_net_of_refunds_per_invoice():
    u1, u2 = uuid4(), uuid4()
    i1, i2 = uuid4(), uuid4()
    rows = users.shape_utm_attribution(
        [(u1, "fb", "cpc", "sale"), (u2, "fb", "cpc", "sale")],
        [_paid(u1, i1, 100_000), _paid(u2, i2, 200_000)],
        [(i1, u1, 30_000, datetime(2026, 3, 12, tzinfo=GMT7))],
    )
    assert rows == [["fb", "cpc", "sale", 2, 2, 270_000]]


def test_utm_fully_refunded_invoice_not_counted_as_payer():
    u1, i1 = uuid4(), uuid4()
    rows = users.shape_utm_attribution(
        [(u1, "fb", "cpc", "sale")],
        [_paid(u1, i1, 100_000)],
        [(i1, u1, 100_000, datetime(2026, 3, 12, tzinfo=GMT7))],
    )
    assert rows[0][3:] == [1, 0, 0]


def test_utm_normalises_case_and_missing_values_and_counts_distinct_payers():
    u1, u2 = uuid4(), uuid4()
    utm = ("fb", "cpc", None)
    rows = users.shape_utm_attribution(
        [(u1, "FB ", "CPC", None), (u2, None, None, None)],
        [_paid(u1, uuid4(), 50_000, utm=utm), _paid(u1, uuid4(), 70_000, utm=utm)],
        [],
    )
    by_key = {tuple(r[:3]): r[3:] for r in rows}
    assert by_key[("fb", "cpc", users.UNKNOWN_UTM)] == [1, 1, 120_000]  # one payer, two invoices
    assert by_key[(users.UNKNOWN_UTM,) * 3] == [1, 0, 0]


def test_utm_sorted_by_revenue_descending_and_totals_conserved():
    u1, u2 = uuid4(), uuid4()
    paid = [
        _paid(u1, uuid4(), 10_000, utm=("a", "m", "c")),
        _paid(u2, uuid4(), 90_000, utm=("b", "m", "c")),
    ]
    rows = users.shape_utm_attribution([], paid, [])
    assert [r[0] for r in rows] == ["b", "a"]
    assert sum(r[5] for r in rows) == 100_000


# --- repeat-customers -----------------------------------------------------------------------


def _pay(uid, amount, paid_at, cycle="monthly", tier="pro"):
    return (uuid4(), uid, paid_at, amount, cycle, tier, False)


def _row_for(rows, code):
    return next(r for r in rows if r[0] == code)


def test_repeat_flags_and_account_code_not_email():
    a, b = uuid4(), uuid4()
    paid = [
        _pay(a, 100_000, datetime(2026, 2, 1, 9, tzinfo=GMT7)),
        _pay(a, 100_000, datetime(2026, 3, 1, 9, tzinfo=GMT7)),
        _pay(b, 80_000, datetime(2026, 3, 5, 9, tzinfo=GMT7)),  # cycle ended long before NOW
    ]
    rows = users.shape_repeat_customers(paid, [], {a: "KH-A", b: "KH-B"}, _ctx())
    ra, rb = _row_for(rows, "KH-A"), _row_for(rows, "KH-B")
    assert ra[1:] == [2, date(2026, 2, 1), date(2026, 3, 1), 200_000, True, False, None]
    assert rb[1] == 1 and rb[5] is False and rb[6] is False
    assert not any("@" in str(cell) for row in rows for cell in row)


def test_single_payment_boundary_cycle_not_yet_due():
    uid = uuid4()
    paid_at = datetime(2026, 3, 20, 9, tzinfo=GMT7)  # cycle ends 20 Apr 23:59:59 GMT+7
    paid = [_pay(uid, 100_000, paid_at)]
    before_end = datetime(2026, 4, 20, 23, 59, 58, tzinfo=GMT7)
    after_end = before_end + timedelta(seconds=2)
    due = users.shape_repeat_customers(paid, [], {uid: "KH-1"}, _ctx(now=before_end))[0]
    past = users.shape_repeat_customers(paid, [], {uid: "KH-1"}, _ctx(now=after_end))[0]
    assert (due[5], due[6]) == (False, True)
    assert (past[5], past[6]) == (False, False)


def test_yearly_single_payment_is_not_yet_due_longer():
    uid = uuid4()
    paid = [_pay(uid, 1_000_000, datetime(2026, 3, 10, 9, tzinfo=GMT7), cycle="yearly")]
    row = users.shape_repeat_customers(paid, [], {uid: "KH-Y"}, _ctx())[0]
    assert row[6] is True


def test_same_instant_payments_do_not_count_as_repeat():
    uid = uuid4()
    at = datetime(2026, 3, 5, 9, tzinfo=GMT7)
    rows = users.shape_repeat_customers(
        [_pay(uid, 50_000, at), _pay(uid, 50_000, at)], [], {uid: "KH-S"}, _ctx()
    )
    assert rows[0][1] == 2 and rows[0][5] is False


def test_summary_rate_excludes_not_yet_due_from_denominator():
    a, b, c = uuid4(), uuid4(), uuid4()
    paid = [
        _pay(a, 1, datetime(2026, 1, 1, 9, tzinfo=GMT7)),
        _pay(a, 1, datetime(2026, 3, 1, 9, tzinfo=GMT7)),  # repeater
        _pay(b, 1, datetime(2026, 3, 2, 9, tzinfo=GMT7)),  # due, did not return
        _pay(c, 1, datetime(2026, 3, 3, 9, tzinfo=GMT7), cycle="yearly"),  # not yet due
    ]
    rows = users.shape_repeat_customers(paid, [], {a: "A", b: "B", c: "C"}, _ctx())
    summary = rows[-1]
    assert summary[0] == "Tổng hợp" and summary[1] == 3
    assert summary[-1] == pytest.approx(1 / 2)
    assert len(rows) == 4


def test_net_amount_after_refund_and_credit_purchases_excluded():
    uid = uuid4()
    refunded = _pay(uid, 100_000, datetime(2026, 3, 1, 9, tzinfo=GMT7))
    credit = _pay(uid, 30_000, datetime(2026, 3, 2, 9, tzinfo=GMT7), tier=CREDIT_INVOICE_TIER)
    refunds = [(refunded[0], uid, 40_000, datetime(2026, 3, 3, tzinfo=GMT7))]
    rows = users.shape_repeat_customers([refunded, credit], refunds, {uid: "KH-R"}, _ctx())
    assert rows[0][1] == 1 and rows[0][4] == 60_000


def test_customers_without_payment_in_window_omitted_and_empty_summary_rate_none():
    uid = uuid4()
    paid = [_pay(uid, 1, datetime(2026, 1, 5, 9, tzinfo=GMT7))]
    rows = users.shape_repeat_customers(paid, [], {uid: "KH-O"}, _ctx())
    assert len(rows) == 1 and rows[0][1] == 0 and rows[0][-1] is None
