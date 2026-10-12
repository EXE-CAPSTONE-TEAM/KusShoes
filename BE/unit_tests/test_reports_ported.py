"""RP-3: the five legacy reports keep their ids, headers and cell semantics. Shapers are pure,
so they run on hand-built rows; headers are the characterisation of the pre-hub output."""

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.models.scan_credit import CREDIT_INVOICE_TIER
from app.services import report_service, reports
from app.services.analytics_service import Payment
from app.services.reports import finance, ops, registry, render, users

LEGACY_HEADERS = {
    "transactions": [
        "Mã",
        "Ngày đặt",
        "Tên khách",
        "Kênh đến",
        "Loại hàng hoá",
        "Giá tiền",
        "Tình trạng thanh toán",
        "Hình thức thanh toán",
        "Tên file biên nhận",
        "Khách quay lại?",
    ],
    "channel-funnel": [
        "Tuần (bắt đầu)",
        "Kênh đến",
        "Đăng ký",
        "Xác thực email",
        "Lưu thiết kế đầu",
        "Thanh toán",
        "Conversion (thanh toán ÷ xác thực)",
    ],
    "revenue": ["Chỉ số", "Giá trị (VND)"],
    "api-cost": ["Ngày", "Số lần gọi", "Thành công", "Thất bại", "Chi phí (VND)"],
    "users": ["Email", "Ngày đăng ký", "Đã xác thực", "Kênh đến"],
}
LEGACY_DOMAIN = {
    "transactions": "tai-chinh",
    "revenue": "tai-chinh",
    "channel-funnel": "nguoi-dung",
    "users": "nguoi-dung",
    "api-cost": "chi-phi-he-thong",
}


def _ctx(start=date(2026, 3, 1), end=date(2026, 3, 31)):
    return reports.build_context(
        SimpleNamespace(date_scoped=True, max_range_days=None),
        "admin",
        start,
        end,
        now=datetime(2026, 4, 5, tzinfo=UTC),
    )


@pytest.mark.parametrize("report_id", LEGACY_HEADERS)
def test_legacy_report_registered_with_same_headers(report_id):
    spec = registry.get(report_id)
    assert spec is not None
    assert [c.label for c in spec.columns] == LEGACY_HEADERS[report_id]
    assert spec.domain == LEGACY_DOMAIN[report_id]
    assert "csv" in spec.formats and "xlsx" in spec.formats


def test_users_is_sensitive_and_revenue_has_pdf_others_ported_do_not():
    by_id = {s.id: s for s in registry.all_specs()}
    assert by_id["users"].sensitive
    assert not any(by_id[i].sensitive for i in LEGACY_HEADERS if i != "users")
    assert "pdf" in by_id["revenue"].formats
    assert not any("pdf" in by_id[i].formats for i in LEGACY_HEADERS if i != "revenue")


def test_legacy_import_surface_still_works():
    assert report_service.render_csv is render.render_csv
    assert report_service.render_xlsx is render.render_xlsx
    assert report_service.generate is reports.generate


def _invoice(**overrides):
    base = dict(
        receipt_snapshot={"customer": "Nguyễn A", "file_slug": "nguyen-a", "date_code": "0103"},
        receipt_number="KUS-00001",
        order_code=111,
        created_at=datetime(2026, 3, 31, 17, 30, tzinfo=UTC),  # 01/04 00:30 GMT+7
        plan_tier="pro",
        billing_cycle="monthly",
        is_upgrade=False,
        amount_vnd=99_000,
        status="paid",
        payment_method="payos",
        user_id="u1",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_transactions_row_semantics():
    rows = finance.shape_transactions(
        [(_invoice(), None, None, "KUS-ACC1", "tiktok")], repeaters={"u1"}
    )
    assert rows == [
        [
            "KUS-00001",
            date(2026, 4, 1),  # business date, not the UTC date
            "Nguyễn A",
            "TikTok",
            "Pro tháng",
            99_000,
            "Thành công",
            "Chuyển khoản VietQR",
            "KUS-00001-nguyen-a-0103.pdf",
            "Có",
        ]
    ]
    assert render.format_value(rows[0][1], "date") == "01/04/2026"


def test_transactions_fallbacks_and_item_labels():
    unpaid = _invoice(receipt_number=None, receipt_snapshot=None, status="pending", user_id="u2")
    upgrade = _invoice(is_upgrade=True)
    credit = _invoice(plan_tier=CREDIT_INVOICE_TIER)
    rows = finance.shape_transactions(
        [
            (unpaid, 0, 0, "KUS-ACC2", None),
            (upgrade, 0, 0, "A", "x"),
            (credit, 0, 0, "A", "direct"),
        ],
        repeaters=set(),
    )
    assert rows[0][0] == "111" and rows[0][2] == "KUS-ACC2" and rows[0][3] == "Khác"
    assert rows[0][8] == "" and rows[0][9] == "Chưa"
    assert rows[1][4] == "Nâng cấp lên Pro"
    assert rows[2][4] == "Credit quét"


def test_repeat_customers_needs_two_distinct_payment_instants():
    t1, t2 = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 2, 1, tzinfo=UTC)
    payments = [
        Payment("i1", "a", t1, 1, "monthly", "pro_monthly", False),
        Payment("i2", "a", t2, 1, "monthly", "pro_monthly", False),
        Payment("i3", "b", t1, 1, "monthly", "pro_monthly", False),
    ]
    assert finance.repeat_customers(payments) == {"a"}


def test_users_filters_by_business_date_window():
    ctx = _ctx()
    rows = [
        ("u1", "a@x.vn", datetime(2026, 3, 31, 16, 59, tzinfo=UTC), True, "email"),  # 31/03 in
        ("u2", "b@x.vn", datetime(2026, 3, 31, 17, 0, tzinfo=UTC), False, "email"),  # 01/04 out
        ("u3", "=c@x.vn", datetime(2026, 2, 28, 17, 0, tzinfo=UTC), False, None),  # 01/03 in
    ]
    shaped = users.shape_users(rows, ctx)
    assert [r[0] for r in shaped] == ["a@x.vn", "=c@x.vn"]
    assert shaped[0][2:] == ["Có", "Email"] and shaped[1][2:] == ["Chưa", "Khác"]


def test_channel_funnel_counts_and_conversion():
    ctx = _ctx()
    day = datetime(2026, 3, 10, 3, 0, tzinfo=UTC)  # Tuesday; ISO week starts 2026-03-09
    rows = [
        ("u1", "", day, True, "email"),
        ("u2", "", day, True, "email"),
        ("u3", "", day, False, "email"),
        ("u4", "", datetime(2026, 5, 1, tzinfo=UTC), True, "email"),  # outside window
    ]
    shaped = users.shape_channel_funnel(rows, designers={"u1", "u3"}, paying={"u1"}, ctx=ctx)
    assert shaped == [["2026-03-09", "Email", 3, 2, 2, 1, 0.5]]
    assert render.format_value(shaped[0][-1], "percent") == "50.0%"


def test_channel_funnel_blank_conversion_without_verified():
    day = datetime(2026, 3, 10, 3, 0, tzinfo=UTC)
    shaped = users.shape_channel_funnel([("u1", "", day, False, None)], set(), set(), _ctx())
    assert shaped[0][-1] is None
    assert render.format_value(None, "percent") == ""


def test_api_cost_has_total_row_that_sums_the_days():
    days = [
        SimpleNamespace(
            day=date(2026, 3, d), calls=c, success_calls=c - f, failed_calls=f, cost_vnd=v
        )
        for d, c, f, v in [(1, 10, 2, 500), (2, 0, 0, 0), (3, 5, 5, 250)]
    ]
    rows = ops.shape_api_cost(days)
    assert len(rows) == 4
    assert rows[-1] == ["Tổng", 15, 8, 7, 750]
    assert render.format_value(rows[0][0], "date") == "01/03/2026"
    assert ops.shape_api_cost([])[-1] == ["Tổng", 0, 0, 0, 0]


def test_revenue_shape_rows():
    data = SimpleNamespace(
        mrr_vnd=1,
        arr_vnd=12,
        arpu_vnd=3,
        paying_customers=4,
        revenue_vnd=SimpleNamespace(current=5),
        refunds_vnd=SimpleNamespace(current=6),
        new_paying_customers=SimpleNamespace(current=7),
        revenue_series=[SimpleNamespace(month="2026-03", revenue_vnd=8)],
        revenue_by_plan=[SimpleNamespace(plan_tier="pro", revenue_vnd=9)],
    )
    rows = finance.shape_revenue(data)
    assert rows[0] == ["MRR", 1] and len(rows) == 9
    assert rows[-2:] == [["Doanh thu tháng 2026-03", 8], ["Theo gói: pro", 9]]
