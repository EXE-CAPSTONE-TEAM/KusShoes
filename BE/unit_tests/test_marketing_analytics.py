"""Unit tests for Marketing and Google Analytics 4 integration."""

import json
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient
import pytest

from app.dependencies import get_current_admin, get_db, get_redis
from app.main import app
from app.services import ga4_service
from app.services import marketing_analytics_service as mkt_svc


def test_normalize_platform_known_sources():
    assert mkt_svc._normalize_platform("tiktok") == "TikTok"
    assert mkt_svc._normalize_platform("vm.tiktok.com") == "TikTok"
    assert mkt_svc._normalize_platform("ttclid") == "TikTok"

    assert mkt_svc._normalize_platform("facebook") == "Facebook / Meta"
    assert mkt_svc._normalize_platform("fb.com") == "Facebook / Meta"
    assert mkt_svc._normalize_platform("instagram") == "Facebook / Meta"
    assert mkt_svc._normalize_platform("fbclid") == "Facebook / Meta"

    assert mkt_svc._normalize_platform("google") == "Google Search"
    assert mkt_svc._normalize_platform("gclid") == "Google Search"

    assert mkt_svc._normalize_platform("zalo") == "Zalo"
    assert mkt_svc._normalize_platform("youtube") == "YouTube"
    assert mkt_svc._normalize_platform("direct") == "Direct"
    assert mkt_svc._normalize_platform(None) == "Direct"


def test_evaluate_platform_relative_to_baselines():
    ev = mkt_svc._evaluate_platform
    # revenue at/above mean of revenue-producing platforms
    assert ev(100, 1, 600_000, baseline_rate=0.05, baseline_revenue=500_000) == "high_performing"
    # conversion at/above site-wide rate
    assert ev(100, 6, 0, baseline_rate=0.05, baseline_revenue=500_000) == "high_performing"
    assert ev(100, 2, 100_000, baseline_rate=0.05, baseline_revenue=500_000) == "moderate"
    assert ev(100, 0, 0, baseline_rate=0.05, baseline_revenue=500_000) == "needs_attention"
    # no GA4 → no rate baseline, still classified by revenue
    assert ev(0, 3, 0, baseline_rate=None, baseline_revenue=0.0) == "moderate"


def test_ga4_connection_unconfigured():
    with patch("app.config.settings.GA4_PROPERTY_ID", ""):
        res = ga4_service.test_connection()
        assert res["status"] == "unconfigured"
        assert res["connected"] is False


def test_ga4_realtime_unconfigured():
    with patch("app.config.settings.GA4_PROPERTY_ID", ""):
        assert ga4_service.get_realtime_active_users() is None


# Shared test fakes
FAKE_SIGNUP_ROWS = [
    ("u1", "tiktok", "cpc", "tet-2026", None, None),
    ("u2", "tiktok", "cpc", "tet-2026", None, None),
    ("u3", "facebook", "ads", "kol-review", None, None),
]

FAKE_PAID_ROWS = [
    ("inv1", "u1", 250_000, "tiktok", "tet-2026", None),
    ("inv2", "u3", 500_000, "facebook", "kol-review", None),
]

FAKE_GA4_DATA = {
    "configured": True,
    "summary": {
        "active_users": 150,
        "new_users": 120,
        "sessions": 200,
        "screen_page_views": 500,
        "bounce_rate": 0.35,
        "average_session_duration": 140.0,
        "engagement_rate": 0.65,
    },
    "channels": [
        {"channel_group": "Paid Social", "source_medium": "tiktok / cpc", "users": 80, "sessions": 100, "avg_duration": 120.0, "engagement_rate": 0.7},
        {"channel_group": "Paid Social", "source_medium": "facebook / ads", "users": 50, "sessions": 70, "avg_duration": 150.0, "engagement_rate": 0.6},
    ],
    "cities": [
        {"city": "Ho Chi Minh City", "country": "Vietnam", "users": 100, "sessions": 130, "share": 0.67},
        {"city": "Hanoi", "country": "Vietnam", "users": 40, "sessions": 50, "share": 0.27},
    ],
    "countries": [{"country": "Vietnam", "users": 140, "sessions": 180}],
    "daily_traffic": [{"date": "2026-10-01", "users": 50, "sessions": 70}],
    "devices": [{"device": "mobile", "users": 120, "share": 0.8}],
    "landing_pages": [{"path": "/products", "sessions": 80, "users": 60}],
}


@pytest.mark.asyncio
async def test_marketing_report_hybrid_aggregation():
    mock_db = AsyncMock()

    with (
        patch("app.repositories.attribution_repo.signup_attribution_rows", AsyncMock(return_value=FAKE_SIGNUP_ROWS)),
        patch("app.repositories.attribution_repo.paid_invoice_attribution_rows", AsyncMock(return_value=FAKE_PAID_ROWS)),
        patch("app.services.ga4_service.fetch_ga4_traffic_data", return_value=FAKE_GA4_DATA),
    ):
        report = await mkt_svc.get_marketing_report(mock_db, date(2026, 10, 1), date(2026, 10, 5))

        assert report["ga4_configured"] is True
        assert report["hero_metrics"]["total_signups"] == 3
        assert report["hero_metrics"]["total_paying_customers"] == 2
        assert report["hero_metrics"]["total_revenue_vnd"] == 750_000

        # Scorecard checks
        scorecard = {item["platform"]: item for item in report["scorecard"]}
        assert "TikTok" in scorecard
        assert scorecard["TikTok"]["signups"] == 2
        assert scorecard["TikTok"]["revenue_vnd"] == 250_000

        assert "Facebook / Meta" in scorecard
        assert scorecard["Facebook / Meta"]["signups"] == 1
        assert scorecard["Facebook / Meta"]["revenue_vnd"] == 500_000

        # Funnel checks
        assert len(report["funnel"]) == 4
        assert report["funnel"][0]["count"] == 150  # Web visitors
        assert report["funnel"][2]["count"] == 3    # Signups
        assert report["funnel"][3]["count"] == 2    # Paying customers


def test_normalize_platform_ga4_direct_and_hosts():
    split = mkt_svc._split_source_medium
    assert mkt_svc._normalize_platform(*split("(direct) / (none)")) == "Direct"
    assert mkt_svc._normalize_platform(*split("google / organic")) == "Google Search"
    assert mkt_svc._normalize_platform(*split("m.facebook.com / referral")) == "Facebook / Meta"
    # Substring false positives must not happen
    assert mkt_svc._normalize_platform("chatgpt.com", "referral") == "Referral / Khác"
    assert mkt_svc._normalize_platform("https://www.metacritic.com/x") != "Facebook / Meta"
    assert mkt_svc._normalize_platform("t.co") == "X (Twitter)"
    assert mkt_svc._normalize_platform("https://youtu.be/abc") == "YouTube"
    # Seen in the real GA4 property (2026-10): login redirect and Messenger shares
    assert mkt_svc._normalize_platform(*split("accounts.google.com / referral")) == "Direct"
    assert mkt_svc._normalize_platform(*split("messenger / chat")) == "Facebook / Meta"
    assert mkt_svc._normalize_platform(*split("lm.facebook.com / referral")) == "Facebook / Meta"
    assert mkt_svc._normalize_platform(*split("bing / organic")) == "Organic Search"


def test_analytics_response_keeps_refund_and_api_cost():
    from app.schemas.analytics import AnalyticsResponse

    assert {"refund_rate", "api_cost_vnd", "gross_margin_vnd"} <= set(AnalyticsResponse.model_fields)


@pytest.mark.asyncio
async def test_marketing_report_vietnam_day_bounds_and_no_fabricated_funnel():
    signup_mock = AsyncMock(return_value=[("u1", None, None, None, None, None)])
    paid_mock = AsyncMock(return_value=[])
    ga4 = {"configured": False, "summary": {}, "channels": []}
    with (
        patch("app.repositories.attribution_repo.signup_attribution_rows", signup_mock),
        patch("app.repositories.attribution_repo.paid_invoice_attribution_rows", paid_mock),
        patch("app.services.ga4_service.fetch_ga4_traffic_data", return_value=ga4),
    ):
        report = await mkt_svc.get_marketing_report(AsyncMock(), date(2026, 10, 1), date(2026, 10, 1))

    _, start_dt, end_dt = signup_mock.call_args.args
    # 00:00 VN time == 17:00 UTC the previous day
    assert start_dt.astimezone(UTC) == datetime(2026, 9, 30, 17, 0, tzinfo=UTC)
    assert end_dt.astimezone(UTC) < datetime(2026, 10, 1, 17, 0, tzinfo=UTC)

    funnel = report["funnel"]
    assert funnel[1]["count"] == 0  # no invented "60% of visitors"
    direct = next(r for r in report["scorecard"] if r["platform"] == "Direct")
    assert direct["signup_rate"] is None  # no visitors → no rate, not 100%


class FakeRedis:
    """In-memory Redis stub for testing router caching behavior."""

    def __init__(self, data: dict[str, str] | None = None) -> None:
        self.values: dict[str, str] = dict(data) if data else {}
        self.set_calls: list[dict[str, Any]] = []

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(
        self, key: str, value: str, *args: Any, ex: int | None = None, **kwargs: Any
    ) -> bool:
        self.values[key] = value
        self.set_calls.append({"key": key, "value": value, "ex": ex})
        return True


@pytest.fixture
def override_admin_and_db():
    app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id="test-admin", role="admin")
    mock_db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield mock_db
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_router_get_marketing_cache_hit_skips_ga4_call(override_admin_and_db):
    cache_key = "marketing_report:2026-10-01:2026-10-05:all"
    cached_report = {
        "ga4_configured": True,
        "property_id": "test-prop",
        "date_from": "2026-10-01",
        "date_to": "2026-10-05",
        "hero_metrics": {
            "active_users": 150,
            "new_users": 120,
            "sessions": 200,
            "screen_page_views": 500,
            "returning_rate": 0.2,
            "bounce_rate": 0.35,
            "average_session_duration": 140.0,
            "engagement_rate": 0.65,
            "total_signups": 3,
            "total_paying_customers": 2,
            "total_revenue_vnd": 750_000,
        },
        "scorecard": [],
        "funnel": [],
        "cities": [],
        "countries": [],
        "daily_traffic": [],
        "devices": [],
        "landing_pages": [],
        "campaigns": [],
    }
    fake_redis = FakeRedis({cache_key: json.dumps(cached_report)})
    app.dependency_overrides[get_redis] = lambda: fake_redis

    with (
        patch("app.services.ga4_service.fetch_ga4_traffic_data") as mock_ga4,
        patch("app.services.marketing_analytics_service.get_marketing_report") as mock_mkt_report,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/analytics/marketing?date_from=2026-10-01&date_to=2026-10-05")

        assert resp.status_code == 200
        assert resp.json()["property_id"] == "test-prop"
        assert resp.json()["hero_metrics"]["total_signups"] == 3
        mock_ga4.assert_not_called()
        mock_mkt_report.assert_not_called()
        assert len(fake_redis.set_calls) == 0


@pytest.mark.asyncio
async def test_router_get_marketing_cache_miss_writes_redis_ex_900(override_admin_and_db):
    fake_redis = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake_redis

    with (
        patch("app.repositories.attribution_repo.signup_attribution_rows", AsyncMock(return_value=FAKE_SIGNUP_ROWS)),
        patch("app.repositories.attribution_repo.paid_invoice_attribution_rows", AsyncMock(return_value=FAKE_PAID_ROWS)),
        patch("app.services.ga4_service.fetch_ga4_traffic_data", return_value=FAKE_GA4_DATA),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/analytics/marketing?date_from=2026-10-01&date_to=2026-10-05")

        assert resp.status_code == 200
        data = resp.json()
        assert data["ga4_configured"] is True
        assert data["hero_metrics"]["total_signups"] == 3

        # Cache miss writes with ex=900
        assert len(fake_redis.set_calls) == 1
        set_call = fake_redis.set_calls[0]
        assert set_call["key"] == "marketing_report:2026-10-01:2026-10-05:all"
        assert set_call["ex"] == 900
        cached_stored = json.loads(set_call["value"])
        assert cached_stored["hero_metrics"]["total_signups"] == 3


@pytest.mark.asyncio
async def test_router_get_marketing_realtime_cache_miss_writes_redis_ex_30(override_admin_and_db):
    fake_redis = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake_redis

    with patch("app.services.ga4_service.get_realtime_active_users", return_value=8):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/analytics/marketing/realtime")

        assert resp.status_code == 200
        data = resp.json()
        assert data["active_now"] == 8

        # Cache miss writes with ex=30
        assert len(fake_redis.set_calls) == 1
        set_call = fake_redis.set_calls[0]
        assert set_call["key"] == "marketing_realtime"
        assert set_call["ex"] == 30
        cached_stored = json.loads(set_call["value"])
        assert cached_stored["active_now"] == 8


@pytest.mark.asyncio
async def test_router_get_marketing_realtime_cache_hit_skips_call(override_admin_and_db):
    cached_realtime = {"active_now": 15, "captured_at": "2026-10-06T12:00:00Z"}
    fake_redis = FakeRedis({"marketing_realtime": json.dumps(cached_realtime)})
    app.dependency_overrides[get_redis] = lambda: fake_redis

    with patch("app.services.ga4_service.get_realtime_active_users") as mock_realtime:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/analytics/marketing/realtime")

        assert resp.status_code == 200
        assert resp.json()["active_now"] == 15
        mock_realtime.assert_not_called()
        assert len(fake_redis.set_calls) == 0


@pytest.mark.asyncio
async def test_router_test_ga4_connection_unconfigured_reports_status_not_500(override_admin_and_db):
    with patch("app.config.settings.GA4_PROPERTY_ID", ""):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/admin/analytics/marketing/test-connection")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unconfigured"
        assert data["connected"] is False
        assert data["property_id"] is None
        assert "Chưa cấu hình" in data["message"]

