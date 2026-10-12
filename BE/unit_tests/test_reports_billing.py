"""RP-5: goi-thanh-toan reports. Shapers are pure, so they run on hand-built rows."""

import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.services import analytics_service, reports
from app.services.analytics_service import Payment
from app.services.reports import billing, registry

IDS = ["revenue-by-plan", "subscriptions", "mrr-movement", "unpaid-invoices", "coupons"]


def _ctx(start=date(2026, 3, 1), end=date(2026, 3, 31)):
    return reports.build_context(
        SimpleNamespace(date_scoped=True, max_range_days=None),
        "admin",
        start,
        end,
        now=datetime(2026, 4, 5, tzinfo=UTC),
    )


def _pay(user, day, amount, tier="pro", cycle="monthly", month=3):
    return Payment(
        uuid.uuid4(), user, datetime(2026, month, day, 5, tzinfo=UTC), amount, cycle, tier, False
    )


def test_five_reports_registered_pdf_only_for_summaries():
    by_id = {s.id: s for s in registry.all_specs() if s.domain == billing.DOMAIN}
    assert set(by_id) == set(IDS)
    assert {i for i, s in by_id.items() if "pdf" in s.formats} == {
        "revenue-by-plan",
        "mrr-movement",
    }
    assert not any(s.sensitive for s in by_id.values())
    assert by_id["subscriptions"].date_scoped is False
    assert by_id["coupons"].date_scoped and by_id["unpaid-invoices"].date_scoped


@pytest.mark.parametrize("report_id", IDS)
def test_row_width_matches_columns(report_id):
    width = len(registry.get(report_id).columns)
    ctx = _ctx()
    coupon = SimpleNamespace(
        code="A",
        discount_type="percent",
        value=10,
        plan_tiers=None,
        max_uses=None,
        used_count=0,
        valid_from=None,
        valid_until=None,
    )
    now = datetime(2026, 3, 2, tzinfo=UTC)
    rows = {
        "revenue-by-plan": billing.shape_revenue_by_plan([_pay("u", 2, 100)], ctx),
        "subscriptions": billing.shape_subscriptions(
            [("KS1", "free", "active", now, None, None, False, False)]
        ),
        "mrr-movement": billing.shape_mrr_movement([_pay("u", 2, 100)], ctx),
        "unpaid-invoices": billing.shape_unpaid_invoices(
            [(1, now, "KS1", "pro", "monthly", 99, "failed", "payos", False)]
        ),
        "coupons": billing.shape_coupons([coupon], [], {}),
    }[report_id]
    assert rows and all(len(row) == width for row in rows)


# --- revenue-by-plan -----------------------------------------------------------------------


def test_revenue_by_plan_shares_sum_to_one_and_count_distinct_customers():
    payments = [
        _pay("a", 2, 300_000),
        _pay("a", 20, 100_000),
        _pay("b", 5, 400_000, tier="basic"),
        _pay("c", 6, 200_000, tier="pro", cycle="yearly"),
    ]
    rows = billing.shape_revenue_by_plan(payments, _ctx())
    assert sum(r[5] for r in rows) == pytest.approx(1.0)
    assert sum(r[4] for r in rows) == sum(p.amount for p in payments)
    pro_monthly = next(r for r in rows if r[0] == "Pro" and r[1] == "tháng")
    assert pro_monthly[2] == 2 and pro_monthly[3] == 1  # two transactions, one customer
    assert [r[4] for r in rows] == sorted((r[4] for r in rows), reverse=True)


def test_revenue_by_plan_refund_nets_revenue_and_full_refund_drops_out():
    invoice_ids = [uuid.uuid4(), uuid.uuid4()]
    paid_at = datetime(2026, 3, 10, tzinfo=UTC)
    paid_rows = [
        (invoice_ids[0], "a", paid_at, 500_000, "monthly", "pro", False),
        (invoice_ids[1], "b", paid_at, 200_000, "monthly", "basic", False),
    ]
    refunds = [
        (invoice_ids[0], "a", 150_000, paid_at),
        (invoice_ids[1], "b", 200_000, paid_at),
    ]
    payments = analytics_service.build_payments(paid_rows, refunds)
    rows = billing.shape_revenue_by_plan(payments, _ctx())
    assert [(r[0], r[4], r[5]) for r in rows] == [("Pro", 350_000, 1.0)]


def test_revenue_by_plan_respects_window_in_gmt7():
    # 2026-03-31T18:00Z is 01/04 in GMT+7 -> outside a March window.
    late = Payment("i", "u", datetime(2026, 3, 31, 18, tzinfo=UTC), 100, "monthly", "pro", False)
    assert billing.shape_revenue_by_plan([late], _ctx()) == []
    assert (
        len(billing.shape_revenue_by_plan([late], _ctx(date(2026, 4, 1), date(2026, 4, 30)))) == 1
    )


def test_revenue_by_plan_labels_credit_and_blank_share_when_empty():
    credit = _pay("u", 3, 50_000, tier=CREDIT_INVOICE_TIER, cycle="credit")
    rows = billing.shape_revenue_by_plan([credit], _ctx())
    assert rows[0][0] == "Credit"
    assert billing.shape_revenue_by_plan([], _ctx()) == []


# --- subscriptions -------------------------------------------------------------------------


def test_subscriptions_uses_account_code_flags_and_gmt7_dates():
    started = datetime(2026, 3, 31, 18, tzinfo=UTC)  # 01/04 in GMT+7
    rows = billing.shape_subscriptions(
        [
            ("KS7", "pro_yearly", "grace", started, started, started, True, True),
            ("KS8", "free", "active", started, None, None, False, False),
        ]
    )
    assert rows[0][0] == "KS7"
    assert rows[0][3] == date(2026, 4, 1)
    assert rows[0][6] == "Có" and rows[0][7] == "Có"
    assert rows[1][4] is None and rows[1][5] is None
    assert rows[1][6] == "Không" and rows[1][7] == "Không"
    assert rows[0][1] != rows[1][1]


def test_subscriptions_unknown_values_pass_through():
    now = datetime(2026, 3, 2, tzinfo=UTC)
    row = billing.shape_subscriptions([("KS1", "weird", "odd", now, None, None, False, False)])[0]
    assert row[1] == "weird" and row[2] == "odd"


# --- mrr-movement --------------------------------------------------------------------------


def test_mrr_movement_one_row_per_month_and_net_new_identity():
    payments = [
        _pay("a", 3, 100, month=2),
        _pay("b", 3, 100, month=2),
        _pay("a", 3, 150, month=3),  # expansion
        _pay("c", 4, 80, month=3),  # new
    ]  # b paid in Feb but not March -> churn 100
    rows = billing.shape_mrr_movement(payments, _ctx(date(2026, 2, 1), date(2026, 3, 31)))
    assert [r[0] for r in rows] == ["2026-02", "2026-03"]
    march = rows[1]
    new, expansion, reactivation, contraction, churn, net_new = march[1:7]
    assert (new, expansion, churn) == (80, 50, 100)
    assert net_new == new + expansion + reactivation - contraction - churn
    for r in rows:
        for rate in r[9:]:
            assert rate is None or rate >= 0


def test_mrr_movement_spans_year_boundary_and_counts_contraction_and_retention():
    payments = [
        _pay("a", 3, 200, month=12),
        _pay("a", 3, 120, month=1),  # contraction 80 (Jan 2026 here, Dec same year ok)
    ]
    payments[0] = Payment(
        "x", "a", datetime(2025, 12, 3, 5, tzinfo=UTC), 200, "monthly", "pro", False
    )
    rows = billing.shape_mrr_movement(payments, _ctx(date(2025, 12, 15), date(2026, 1, 20)))
    assert [r[0] for r in rows] == ["2025-12", "2026-01"]
    jan = rows[1]
    assert jan[4] == 80 and jan[6] == -80
    assert jan[10] == pytest.approx(0.6) and jan[11] == pytest.approx(0.6)  # NRR=GRR=120/200


def test_mrr_movement_empty_payments_gives_zero_rows_with_blank_rates():
    rows = billing.shape_mrr_movement([], _ctx())
    assert rows == [["2026-03", 0, 0, 0, 0, 0, 0, 0, 0, None, None, None]]


# --- unpaid-invoices -----------------------------------------------------------------------


def test_unpaid_invoices_maps_status_method_and_hides_email():
    created = datetime(2026, 3, 31, 18, tzinfo=UTC)
    rows = billing.shape_unpaid_invoices(
        [
            (
                123456,
                created,
                "KS9",
                "pro",
                "yearly",
                1_990_000,
                "awaiting_approval",
                "manual",
                True,
            ),
            (123457, created, "KS9", "basic", "monthly", 99_000, "failed", "momo", False),
        ]
    )
    assert rows[0][:3] == ["123456", date(2026, 4, 1), "KS9"]
    assert rows[0][5] == "Chờ duyệt" and rows[0][6] == "Thủ công" and rows[0][7] == "Có"
    assert rows[1][5] == "Thất bại" and rows[1][7] == "Không"
    assert "@" not in "".join(str(c) for row in rows for c in row)


# --- coupons -------------------------------------------------------------------------------


def _coupon(code, **kw):
    base = dict(
        code=code,
        discount_type="percent",
        value=20,
        plan_tiers=None,
        max_uses=None,
        used_count=0,
        valid_from=None,
        valid_until=None,
    )
    return SimpleNamespace(**{**base, **kw})


def test_coupons_aggregates_case_insensitively_and_unused_coupons_stay_listed():
    i1, i2, i3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    usage = [(i1, "SALE20", 20_000), (i2, "sale20", 30_000), (i3, "OTHER", 5)]
    net = {i1: 80_000, i2: 70_000}  # i3 absent: fully refunded
    rows = billing.shape_coupons(
        [_coupon("SALE20", used_count=7, max_uses=10), _coupon("NONE")], usage, net
    )
    sale, none = rows
    assert sale[6] == 2 and sale[7] == 50_000 and sale[8] == 150_000
    assert sale[5] == "7/10"
    assert none[6:] == [0, 0, 0] and none[5] == "0/∞"


def test_coupons_value_validity_and_plan_formatting():
    fixed = _coupon(
        "FIX",
        discount_type="fixed",
        value=50_000,
        plan_tiers=["basic", "pro"],
        valid_from=datetime(2026, 3, 31, 18, tzinfo=UTC),
        valid_until=None,
    )
    row = billing.shape_coupons([fixed, _coupon("PCT")], [], {})[0]
    assert row[2] == "50.000 đ"
    assert row[3] == "Basic, Pro"
    assert row[4] == "01/04/2026 – …"
    pct = billing.shape_coupons([_coupon("PCT")], [], {})[0]
    assert pct[2] == "20%" and pct[3] == "Tất cả" and pct[4] == "Không giới hạn"
