"""RP-4: tai-chinh reports daily-pnl, refunds, vat. Pure shapers over hand-built rows."""

import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import finance_overview_service, reports
from app.services.analytics_service import build_payments
from app.services.reports import finance, registry

NOW = datetime(2026, 4, 5, tzinfo=UTC)


def _ctx(start=date(2026, 3, 1), end=date(2026, 3, 3)):
    return reports.build_context(
        SimpleNamespace(date_scoped=True, max_range_days=None), "admin", start, end, now=NOW
    )


def _paid(invoice_id, paid_at, amount):
    # (id, user, paid_at, amount, cycle, tier, is_upgrade)
    return (invoice_id, uuid.uuid4(), paid_at, amount, "monthly", "pro", False)


def _refund(invoice_id, amount):
    return (invoice_id, None, amount, NOW)


def test_new_reports_registered_in_tai_chinh():
    for report_id in ("daily-pnl", "refunds", "vat"):
        spec = registry.get(report_id)
        assert spec is not None and spec.domain == "tai-chinh"


def test_daily_pnl_zero_fills_days_and_blanks_margin_without_revenue():
    ctx = _ctx()
    paid = [_paid("a", datetime(2026, 3, 2, 3, tzinfo=UTC), 100_000)]
    table = finance.shape_daily_pnl(paid, [], {date(2026, 3, 1): 5_000}, ctx)
    assert [row[0] for row in table] == [date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 3)]
    day1, day2, day3 = table
    assert day1[6] is None and day1[5] < 0  # cost but no revenue -> loss, blank margin
    assert day3[1:] == [0, 0, 0, 0, 0, None]
    assert day2[6] == pytest.approx(1.0)  # no API cost -> full margin, as a fraction


def test_daily_pnl_margin_falls_as_api_cost_rises():
    ctx = _ctx()
    paid = [_paid("a", datetime(2026, 3, 2, 3, tzinfo=UTC), 100_000)]
    low = finance.shape_daily_pnl(paid, [], {date(2026, 3, 2): 10_000}, ctx)[1]
    high = finance.shape_daily_pnl(paid, [], {date(2026, 3, 2): 60_000}, ctx)[1]
    assert 0 < high[6] < low[6] < 1
    assert high[5] == high[3] - high[4]


def test_daily_pnl_refund_lowers_net_and_gross_minus_refund_equals_net():
    ctx = _ctx()
    paid = [_paid("a", datetime(2026, 3, 2, 3, tzinfo=UTC), 100_000)]
    plain = finance.shape_daily_pnl(paid, [], {}, ctx)[1]
    refunded = finance.shape_daily_pnl(paid, [_refund("a", 30_000)], {}, ctx)[1]
    assert refunded[3] < plain[3]
    assert refunded[1] - refunded[2] == refunded[3]


def test_daily_pnl_net_matches_dashboard_series():
    ctx = _ctx()
    paid = [
        _paid("a", datetime(2026, 3, 1, 3, tzinfo=UTC), 100_000),
        _paid("b", datetime(2026, 3, 3, 3, tzinfo=UTC), 200_000),
    ]
    refunds = [_refund("b", 50_000)]
    dashboard = finance_overview_service.revenue_by_day(build_payments(paid, refunds))
    table = finance.shape_daily_pnl(paid, refunds, {}, ctx)
    assert {row[0]: row[3] for row in table if row[3]} == dashboard


def test_daily_pnl_gmt7_boundary_moves_payment_to_next_business_day():
    ctx = _ctx()
    just_before = datetime(2026, 3, 1, 16, 59, 59, tzinfo=UTC)  # 23:59:59 on 1 Mar GMT+7
    at_midnight = just_before + timedelta(seconds=1)  # 00:00:00 on 2 Mar GMT+7
    paid = [_paid("a", just_before, 10_000), _paid("b", at_midnight, 20_000)]
    day1, day2, _ = finance.shape_daily_pnl(paid, [], {}, ctx)
    assert day1[3] > 0 and day2[3] > day1[3]
    assert day1[1] + day2[1] == 30_000


def _refund_row(created_at=datetime(2026, 3, 1, 17, 30, tzinfo=UTC), receipt="KUS-1", order=99):
    return (created_at, receipt, order, "KH0001", "pro", "monthly", 100_000, 40_000, "Lỗi", "AD01")


def test_refunds_shape_uses_gmt7_day_and_falls_back_to_order_code():
    table = finance.shape_refunds([_refund_row(receipt=None, order=1234)])
    day, ref, customer, _plan, original, refunded, _reason, actor = table[0]
    assert day == date(2026, 3, 2)  # 17:30 UTC is already the next day in GMT+7
    assert ref == "1234"
    assert refunded <= original
    assert "@" not in customer and "@" not in actor  # BR-88: codes, never email


def _invoice(amount=110_000, snapshot=None, discount=0):
    return SimpleNamespace(
        receipt_number="KUS-7",
        order_code=7,
        paid_at=datetime(2026, 3, 1, 18, tzinfo=UTC),
        listed_price_vnd=amount + discount,
        discount_vnd=discount,
        amount_vnd=amount,
        receipt_snapshot=snapshot,
    )


def test_vat_frozen_snapshot_splits_without_changing_total():
    snap = {"vat_enabled": True, "vat_rate_percent": 10, "vat_vnd": 10_000, "net_vnd": 100_000}
    row = finance.shape_vat([(_invoice(snapshot=snap, discount=5_000), "KH1")])[0]
    assert row[1] == date(2026, 3, 2)
    assert row[6] + row[7] == row[5]  # before-tax + VAT == amount paid
    assert 0 < row[8] < 1
    assert row[3] - row[4] == row[5]  # listed - discount == paid


def test_vat_disabled_gives_zero_vat_and_untouched_total():
    snap = {"vat_enabled": False, "vat_rate_percent": 10, "vat_vnd": 0, "net_vnd": 110_000}
    row = finance.shape_vat([(_invoice(snapshot=snap), "KH1")])[0]
    assert row[7] == 0 and row[6] == row[5] and row[8] == 0


def test_vat_follows_live_toggle_for_unsnapshotted_invoice(monkeypatch):
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    monkeypatch.setattr(settings, "VAT_RATE_PERCENT", 8)
    row = finance.shape_vat([(_invoice(amount=108_000), "KH1")])[0]
    assert 0 < row[7] < row[5] and row[6] + row[7] == row[5]
