"""Marketing & Traffic Analytics service (Hybrid GA4 + PostgreSQL).

Combines anonymous web acquisition metrics from Google Analytics 4 Data API
with verified customer registration and revenue records from the internal database.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.repositories import attribution_repo
from app.services import ga4_service

# GA4 buckets dates in the *property's* timezone. Assumed Asia/Ho_Chi_Minh (the zone the
# Celery scheduler uses) — verify in GA4 Admin › Property settings if numbers look shifted.
REPORT_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


_DIRECT_TOKENS = {"direct", "(direct)", "none", "(none)"}

# Hosts users pass *through* mid-session (OAuth login, payment gateways). A session
# "from" them is our own user returning, not an acquisition channel.
_SELF_REFERRAL_HOSTS = ("accounts.google.com", "payos.vn", "pay.payos.vn", "momo.vn", "vnpayment.vn")


def _source_host(source: str) -> str:
    """Reduce a utm_source / referrer URL / GA4 source to a bare lowercase host-ish token."""
    s = source.lower().strip()
    s = re.sub(r"^[a-z][a-z0-9+.-]*://", "", s)
    s = s.split("/", 1)[0].split("?", 1)[0]
    return s.removeprefix("www.")


def _host_is(host: str, *domains: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _normalize_platform(source: str | None, medium: str | None = None) -> str:
    """Map raw utm_source, referrer URL, or GA4 sessionSource into canonical platform names.

    Matching is done on whole host labels / tokens, never raw substrings, so that
    e.g. ``chatgpt.com`` is not mistaken for ``t.co``.
    """
    if not source or source.lower().strip() in _DIRECT_TOKENS:
        return "Direct"

    host = _source_host(source)
    if _host_is(host, *_SELF_REFERRAL_HOSTS):
        return "Direct"
    tokens = set(re.split(r"[^a-z0-9]+", host)) - {""}
    m = (medium or "").lower().strip()

    if tokens & {"tiktok", "ttclid"}:
        return "TikTok"
    if tokens & {"facebook", "fb", "fbclid", "instagram", "messenger"} or _host_is(host, "fb.com", "fb.me"):
        return "Facebook / Meta"
    if tokens & {"google", "gclid"}:
        return "Google Search"
    if "zalo" in tokens:
        return "Zalo"
    if "youtube" in tokens or _host_is(host, "youtu.be"):
        return "YouTube"
    if "coccoc" in tokens:
        return "Cốc Cốc"
    if "twitter" in tokens or _host_is(host, "x.com", "t.co"):
        return "X (Twitter)"
    if "telegram" in tokens or _host_is(host, "t.me"):
        return "Telegram"
    if m == "organic" or "search" in m:
        return "Organic Search"
    if m in ("referral", "link"):
        return "Referral / Khác"

    return host.capitalize() if 0 < len(host) <= 15 else "Referral / Khác"


def _split_source_medium(source_medium: str) -> tuple[str, str]:
    """GA4 ``sessionSourceMedium`` is ``"<source> / <medium>"``."""
    source, _, medium = source_medium.partition(" / ")
    return source.strip(), medium.strip()


def _evaluate_platform(
    visitors: int,
    signups: int,
    revenue: int,
    baseline_rate: float | None,
    baseline_revenue: float,
) -> str:
    """Tag a platform relative to the period's own baselines — no absolute thresholds.

    - high_performing: brings revenue at or above the mean revenue of revenue-producing
      platforms, or converts visitors→signups at or above the site-wide rate.
    - needs_attention: produced neither a signup nor revenue.
    - moderate: everything in between.
    """
    if signups == 0 and revenue == 0:
        return "needs_attention"
    if revenue > 0 and revenue >= baseline_revenue:
        return "high_performing"
    if baseline_rate is not None and visitors > 0 and signups / visitors >= baseline_rate:
        return "high_performing"
    return "moderate"


async def get_marketing_report(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    country: str | None = None,
) -> dict[str, Any]:
    """Generate reconciled marketing and traffic report for the given period."""
    # Vietnam-local day boundaries so DB counts line up with GA4's per-day buckets.
    # end_dt is exclusive (next local midnight); the repo filters with <=, which
    # only differs at the single instant of midnight.
    start_dt = datetime.combine(date_from, time.min, tzinfo=REPORT_TZ)
    end_dt = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=REPORT_TZ) - timedelta(microseconds=1)

    # 1. Top-of-funnel from Google Analytics 4 (blocking gRPC → worker thread)
    ga4_data = await run_in_threadpool(ga4_service.fetch_ga4_traffic_data, date_from, date_to, country)
    ga4_configured = ga4_data.get("configured", False)
    ga4_summary = ga4_data.get("summary", {})
    ga4_channels = ga4_data.get("channels", [])

    # Map GA4 channels into normalized platform buckets.
    # NOTE: activeUsers is not additive across source/medium rows (one user can arrive
    # via several sources), so a bucket's "visitors" is an upper bound. Sessions are
    # additive and exact.
    ga4_platform_metrics: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"visitors": 0, "sessions": 0, "duration_sum": 0.0, "eng_sum": 0.0, "count": 0}
    )

    for ch in ga4_channels:
        norm = _normalize_platform(*_split_source_medium(ch.get("source_medium", "")))
        bucket = ga4_platform_metrics[norm]
        u = ch.get("users", 0)
        s = ch.get("sessions", 0)
        bucket["visitors"] += u
        bucket["sessions"] += s
        bucket["duration_sum"] += ch.get("avg_duration", 0.0) * s
        bucket["eng_sum"] += ch.get("engagement_rate", 0.0) * s
        bucket["count"] += s

    # 2. Bottom-of-funnel from Database (Registrations & Paid Invoices)
    signup_rows = await attribution_repo.signup_attribution_rows(db, start_dt, end_dt)
    paid_invoice_rows = await attribution_repo.paid_invoice_attribution_rows(db, start_dt, end_dt)

    db_platform_signups: dict[str, int] = defaultdict(int)
    for row in signup_rows:
        _, utm_source, _, _, initial_ref, _ = row
        src = utm_source or initial_ref or "direct"
        norm = _normalize_platform(src)
        db_platform_signups[norm] += 1

    db_platform_revenue: dict[str, int] = defaultdict(int)
    db_platform_paying_users: dict[str, set] = defaultdict(set)
    for row in paid_invoice_rows:
        _, user_id, amount_vnd, utm_source, _, _ = row
        src = utm_source or "direct"
        norm = _normalize_platform(src)
        db_platform_revenue[norm] += amount_vnd
        db_platform_paying_users[norm].add(user_id)

    # 3. Campaign Performance Breakdown
    campaign_signups: dict[str, int] = defaultdict(int)
    for row in signup_rows:
        _, _, _, utm_campaign, _, _ = row
        c_name = utm_campaign or "(không gắn chiến dịch)"
        campaign_signups[c_name] += 1

    campaign_revenue: dict[str, int] = defaultdict(int)
    campaign_paying_users: dict[str, set] = defaultdict(set)
    for row in paid_invoice_rows:
        _, user_id, amount_vnd, _, utm_campaign, _ = row
        c_name = utm_campaign or "(không gắn chiến dịch)"
        campaign_revenue[c_name] += amount_vnd
        campaign_paying_users[c_name].add(user_id)

    campaign_items = []
    all_campaign_names = set(campaign_signups.keys()) | set(campaign_revenue.keys())
    for c_name in sorted(all_campaign_names):
        campaign_items.append({
            "campaign": c_name,
            "signups": campaign_signups[c_name],
            "paying_customers": len(campaign_paying_users[c_name]),
            "revenue_vnd": campaign_revenue[c_name],
        })
    campaign_items.sort(key=lambda x: (x["revenue_vnd"], x["signups"]), reverse=True)

    # 4. Assemble Multi-tier Platform Performance Scorecard
    all_platforms = set(ga4_platform_metrics.keys()) | set(db_platform_signups.keys()) | set(db_platform_revenue.keys())
    if not all_platforms:
        all_platforms = {"Direct", "Google Search", "Facebook / Meta", "TikTok", "Zalo"}

    # Baselines for _evaluate_platform, derived from this period's data.
    site_visitors = ga4_summary.get("active_users", 0)
    baseline_rate = len(signup_rows) / site_visitors if site_visitors > 0 else None
    revenue_values = [v for v in db_platform_revenue.values() if v > 0]
    baseline_revenue = sum(revenue_values) / len(revenue_values) if revenue_values else 0.0

    scorecard = []
    for plat in sorted(all_platforms):
        ga4_p = ga4_platform_metrics.get(plat, {"visitors": 0, "sessions": 0, "duration_sum": 0.0, "eng_sum": 0.0, "count": 0})
        s_cnt = ga4_p["count"]
        avg_dur = round(ga4_p["duration_sum"] / max(s_cnt, 1), 1) if s_cnt else 0.0
        eng_rate = round(ga4_p["eng_sum"] / max(s_cnt, 1), 4) if s_cnt else 0.0
        vis = ga4_p["visitors"]
        signups = db_platform_signups.get(plat, 0)
        paying_cust = len(db_platform_paying_users.get(plat, set()))
        rev = db_platform_revenue.get(plat, 0)
        signup_rate = min(round(signups / vis, 4), 1.0) if vis > 0 else None

        scorecard.append({
            "platform": plat,
            "visitors": vis,
            "sessions": ga4_p["sessions"],
            "avg_duration_sec": avg_dur,
            "engagement_rate": eng_rate,
            "signups": signups,
            "signup_rate": signup_rate,
            "paying_customers": paying_cust,
            "revenue_vnd": rev,
            "evaluation": _evaluate_platform(vis, signups, rev, baseline_rate, baseline_revenue),
        })

    # Sort scorecard by revenue descending, then by signups and visitors
    scorecard.sort(key=lambda x: (x["revenue_vnd"], x["signups"], x["visitors"]), reverse=True)

    # 5. Conversion Funnel (4 steps)
    total_visitors = ga4_summary.get("active_users", 0)
    total_signups = len(signup_rows)
    total_paying = len({row[1] for row in paid_invoice_rows})
    # Sessions that *landed* on a product/3D/pricing page — a measured lower bound,
    # not an estimate. 0 means GA4 recorded none (or is unconfigured).
    product_views = sum(
        lp["sessions"]
        for lp in ga4_data.get("landing_pages", [])
        if any(k in lp["path"] for k in ("product", "artisan", "pricing"))
    )

    # The DB stores no visitor country, so DB steps stay global even when GA4 is filtered.
    def db_label(text: str) -> str:
        return f"{text} (DB, mọi quốc gia)" if country else f"{text} (DB)"

    funnel_steps = [
        {"step": "Lưu lượng vào Website", "count": total_visitors, "label": "Khách ghé thăm (GA4)"},
        {"step": "Xem Sản phẩm & 3D Studio", "count": product_views, "label": "Phiên đáp xuống trang sản phẩm (GA4)"},
        {"step": "Đăng ký Tài khoản", "count": total_signups, "label": db_label("Tài khoản mới")},
        {"step": "Thanh toán Đơn hàng", "count": total_paying, "label": db_label("Khách trả tiền")},
    ]

    # Step-to-step conversion, measured against the nearest earlier step that has
    # data — a missing GA4 step must not zero out the DB steps after it.
    for idx, f in enumerate(funnel_steps):
        if idx == 0:
            f["conversion_rate"] = 1.0
            continue
        prev_cnt = next((p["count"] for p in reversed(funnel_steps[:idx]) if p["count"] > 0), 0)
        f["conversion_rate"] = min(round(f["count"] / prev_cnt, 4), 1.0) if prev_cnt > 0 else 0.0

    # 6. Hero KPIs
    active_users = ga4_summary.get("active_users", 0)
    new_users = ga4_summary.get("new_users", 0)
    returning_users = max(active_users - new_users, 0)
    returning_rate = round(returning_users / max(active_users, 1), 4) if active_users > 0 else 0.0

    hero_metrics = {
        "active_users": active_users,
        "new_users": new_users,
        "sessions": ga4_summary.get("sessions", 0),
        "screen_page_views": ga4_summary.get("screen_page_views", 0),
        "returning_rate": returning_rate,
        "bounce_rate": ga4_summary.get("bounce_rate", 0.0),
        "average_session_duration": ga4_summary.get("average_session_duration", 0.0),
        "engagement_rate": ga4_summary.get("engagement_rate", 0.0),
        "total_signups": total_signups,
        "total_paying_customers": total_paying,
        "total_revenue_vnd": sum(row[2] for row in paid_invoice_rows),
    }

    return {
        "ga4_configured": ga4_configured,
        "property_id": ga4_service.settings.GA4_PROPERTY_ID or None,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "hero_metrics": hero_metrics,
        "scorecard": scorecard,
        "funnel": funnel_steps,
        "cities": ga4_data.get("cities", []),
        "countries": ga4_data.get("countries", []),
        "daily_traffic": ga4_data.get("daily_traffic", []),
        "devices": ga4_data.get("devices", []),
        "landing_pages": ga4_data.get("landing_pages", []),
        "campaigns": campaign_items,
    }


async def get_realtime_metrics() -> dict[str, Any]:
    """Query current realtime active visitors (None when GA4 is unconfigured/unreachable)."""
    active_now = await run_in_threadpool(ga4_service.get_realtime_active_users)
    return {
        "active_now": active_now,
        "captured_at": datetime.now(UTC).isoformat(),
    }
