"""Google Analytics 4 Data API client service.

Communicates with GA4 v1beta Data API using Google Service Account credentials.
Provides query abstraction for realtime visitor counts, geographic distribution,
traffic channels, and session engagement metrics.
"""

from __future__ import annotations

import json
import os
from datetime import date
from functools import lru_cache
from typing import Any

from loguru import logger

from app.config import settings

# Lazy imported or gracefully handled if credentials missing
try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange,
        Dimension,
        Filter,
        FilterExpression,
        Metric,
        RunRealtimeReportRequest,
        RunReportRequest,
    )
    from google.oauth2 import service_account

    GA4_AVAILABLE = True
except ImportError:
    GA4_AVAILABLE = False
    logger.warning("google-analytics-data is not installed. GA4 integration running in stub mode.")


@lru_cache(maxsize=1)
def get_credentials() -> Any | None:
    """Load Google Service Account credentials from raw JSON or path."""
    if not GA4_AVAILABLE:
        return None

    if settings.GA4_CREDENTIALS_JSON_RAW:
        try:
            info = json.loads(settings.GA4_CREDENTIALS_JSON_RAW)
            return service_account.Credentials.from_service_account_info(info)
        except Exception as exc:
            logger.error(f"Failed to load GA4 credentials from raw JSON: {exc}")
            return None

    if settings.GA4_CREDENTIALS_JSON_PATH and os.path.exists(settings.GA4_CREDENTIALS_JSON_PATH):
        try:
            return service_account.Credentials.from_service_account_file(
                settings.GA4_CREDENTIALS_JSON_PATH
            )
        except Exception as exc:
            logger.error(f"Failed to load GA4 credentials from path {settings.GA4_CREDENTIALS_JSON_PATH}: {exc}")
            return None

    return None


@lru_cache(maxsize=1)
def get_client() -> Any | None:
    """Return BetaAnalyticsDataClient instance if configured, else None."""
    if not GA4_AVAILABLE:
        return None

    creds = get_credentials()
    if not creds:
        return None

    try:
        return BetaAnalyticsDataClient(credentials=creds)
    except Exception as exc:
        logger.error(f"Failed to initialize BetaAnalyticsDataClient: {exc}")
        return None


def is_configured() -> bool:
    """Check whether GA4 Property ID and credentials are fully supplied."""
    if not settings.GA4_PROPERTY_ID:
        return False
    return get_credentials() is not None


def test_connection() -> dict[str, Any]:
    """Test read access to the configured GA4 property."""
    if not is_configured():
        return {
            "status": "unconfigured",
            "connected": False,
            "message": "Chưa cấu hình GA4_PROPERTY_ID hoặc Google Service Account Credentials trong file môi trường.",
            "property_id": settings.GA4_PROPERTY_ID or None,
        }

    client = get_client()
    if not client:
        return {
            "status": "error",
            "connected": False,
            "message": "Không thể khởi tạo Google Analytics Client với thông tin khóa đã cung cấp.",
            "property_id": settings.GA4_PROPERTY_ID,
        }

    try:
        req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[DateRange(start_date="yesterday", end_date="today")],
            metrics=[Metric(name="activeUsers")],
            limit=1,
        )
        resp = client.run_report(req)
        return {
            "status": "connected",
            "connected": True,
            "message": "Kết nối thành công tới Google Analytics 4.",
            "property_id": settings.GA4_PROPERTY_ID,
            "rows_sampled": len(resp.rows),
        }
    except Exception as exc:
        logger.error(f"GA4 test connection failed: {exc}")
        return {
            "status": "error",
            "connected": False,
            "message": f"Lỗi truy vấn Google Analytics Data API: {exc}",
            "property_id": settings.GA4_PROPERTY_ID,
        }


def get_realtime_active_users() -> int | None:
    """Return active visitors in the last 30 minutes, or None if GA4 can't be queried."""
    if not is_configured():
        return None

    client = get_client()
    if not client:
        return None

    try:
        req = RunRealtimeReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            metrics=[Metric(name="activeUsers")],
        )
        resp = client.run_realtime_report(req)
        if resp.rows:
            return int(resp.rows[0].metric_values[0].value)
        return 0
    except Exception as exc:
        logger.warning(f"Failed to fetch GA4 realtime active users: {exc}")
        return None


def fetch_ga4_traffic_data(
    date_from: date,
    date_to: date,
    country: str | None = None,
) -> dict[str, Any]:
    """Fetch aggregated traffic, channel breakdown, and geography from GA4.

    If not configured or query fails, returns empty structures.
    """
    if not is_configured():
        return {
            "configured": False,
            "summary": {
                "active_users": 0,
                "new_users": 0,
                "sessions": 0,
                "screen_page_views": 0,
                "bounce_rate": 0.0,
                "average_session_duration": 0.0,
                "engagement_rate": 0.0,
            },
            "channels": [],
            "cities": [],
            "countries": [],
            "daily_traffic": [],
            "devices": [],
            "landing_pages": [],
        }

    client = get_client()
    if not client:
        return {
            "configured": False,
            "summary": {
                "active_users": 0,
                "new_users": 0,
                "sessions": 0,
                "screen_page_views": 0,
                "bounce_rate": 0.0,
                "average_session_duration": 0.0,
                "engagement_rate": 0.0,
            },
            "channels": [],
            "cities": [],
            "countries": [],
            "daily_traffic": [],
            "devices": [],
            "landing_pages": [],
        }

    date_range = DateRange(
        start_date=date_from.strftime("%Y-%m-%d"),
        end_date=date_to.strftime("%Y-%m-%d"),
    )

    dimension_filter = None
    if country:
        dimension_filter = FilterExpression(
            filter=Filter(
                field_name="country",
                string_filter=Filter.StringFilter(
                    value=country,
                    match_type=Filter.StringFilter.MatchType.EXACT,
                ),
            )
        )

    # 1. Summary Metrics
    summary = {
        "active_users": 0,
        "new_users": 0,
        "sessions": 0,
        "screen_page_views": 0,
        "bounce_rate": 0.0,
        "average_session_duration": 0.0,
        "engagement_rate": 0.0,
    }

    try:
        sum_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            metrics=[
                Metric(name="activeUsers"),
                Metric(name="newUsers"),
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
                Metric(name="engagementRate"),
            ],
            dimension_filter=dimension_filter,
        )
        sum_resp = client.run_report(sum_req)
        if sum_resp.rows:
            vals = sum_resp.rows[0].metric_values
            summary["active_users"] = int(vals[0].value or 0)
            summary["new_users"] = int(vals[1].value or 0)
            summary["sessions"] = int(vals[2].value or 0)
            summary["screen_page_views"] = int(vals[3].value or 0)
            summary["bounce_rate"] = float(vals[4].value or 0.0)
            summary["average_session_duration"] = float(vals[5].value or 0.0)
            summary["engagement_rate"] = float(vals[6].value or 0.0)
    except Exception as exc:
        logger.error(f"GA4 summary query failed: {exc}")

    # 2. Daily Traffic Series
    daily_traffic = []
    try:
        daily_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="date")],
            metrics=[Metric(name="activeUsers"), Metric(name="sessions")],
            dimension_filter=dimension_filter,
        )
        daily_resp = client.run_report(daily_req)
        for row in daily_resp.rows:
            # GA4 returns date as YYYYMMDD
            raw_d = row.dimension_values[0].value
            formatted_d = f"{raw_d[:4]}-{raw_d[4:6]}-{raw_d[6:]}" if len(raw_d) == 8 else raw_d
            daily_traffic.append({
                "date": formatted_d,
                "users": int(row.metric_values[0].value or 0),
                "sessions": int(row.metric_values[1].value or 0),
            })
        daily_traffic.sort(key=lambda x: x["date"])
    except Exception as exc:
        logger.error(f"GA4 daily traffic query failed: {exc}")

    # 3. Channels & Sources
    channels = []
    try:
        chan_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="sessionDefaultChannelGroup"), Dimension(name="sessionSourceMedium")],
            metrics=[
                Metric(name="activeUsers"),
                Metric(name="sessions"),
                Metric(name="averageSessionDuration"),
                Metric(name="engagementRate"),
            ],
            dimension_filter=dimension_filter,
            limit=25,
        )
        chan_resp = client.run_report(chan_req)
        for row in chan_resp.rows:
            channels.append({
                "channel_group": row.dimension_values[0].value,
                "source_medium": row.dimension_values[1].value,
                "users": int(row.metric_values[0].value or 0),
                "sessions": int(row.metric_values[1].value or 0),
                "avg_duration": float(row.metric_values[2].value or 0.0),
                "engagement_rate": float(row.metric_values[3].value or 0.0),
            })
    except Exception as exc:
        logger.error(f"GA4 channels query failed: {exc}")

    # 4. Cities & Geography
    cities = []
    try:
        city_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="city"), Dimension(name="country")],
            metrics=[Metric(name="activeUsers"), Metric(name="sessions")],
            dimension_filter=dimension_filter,
            limit=30,
        )
        city_resp = client.run_report(city_req)
        tot_users = max(summary["active_users"], 1)
        for row in city_resp.rows:
            c_name = row.dimension_values[0].value
            if c_name == "(not set)":
                continue
            u_count = int(row.metric_values[0].value or 0)
            cities.append({
                "city": c_name,
                "country": row.dimension_values[1].value,
                "users": u_count,
                "sessions": int(row.metric_values[1].value or 0),
                "share": round(u_count / tot_users, 4),
            })
    except Exception as exc:
        logger.error(f"GA4 cities query failed: {exc}")

    # 5. Top Countries
    countries = []
    try:
        country_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="country")],
            metrics=[Metric(name="activeUsers"), Metric(name="sessions")],
            limit=15,
        )
        country_resp = client.run_report(country_req)
        for row in country_resp.rows:
            countries.append({
                "country": row.dimension_values[0].value,
                "users": int(row.metric_values[0].value or 0),
                "sessions": int(row.metric_values[1].value or 0),
            })
    except Exception as exc:
        logger.error(f"GA4 countries query failed: {exc}")

    # 6. Device Category
    devices = []
    try:
        dev_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="deviceCategory")],
            metrics=[Metric(name="activeUsers")],
            dimension_filter=dimension_filter,
        )
        dev_resp = client.run_report(dev_req)
        tot_u = max(summary["active_users"], 1)
        for row in dev_resp.rows:
            d_name = row.dimension_values[0].value
            cnt = int(row.metric_values[0].value or 0)
            devices.append({
                "device": d_name,
                "users": cnt,
                "share": round(cnt / tot_u, 4),
            })
    except Exception as exc:
        logger.error(f"GA4 devices query failed: {exc}")

    # 7. Landing Pages
    landing_pages = []
    try:
        lp_req = RunReportRequest(
            property=f"properties/{settings.GA4_PROPERTY_ID}",
            date_ranges=[date_range],
            dimensions=[Dimension(name="landingPage")],  # path only: fbclid/gtm params split one page into many rows
            metrics=[Metric(name="sessions"), Metric(name="activeUsers")],
            dimension_filter=dimension_filter,
            limit=15,
        )
        lp_resp = client.run_report(lp_req)
        for row in lp_resp.rows:
            landing_pages.append({
                "path": row.dimension_values[0].value,
                "sessions": int(row.metric_values[0].value or 0),
                "users": int(row.metric_values[1].value or 0),
            })
    except Exception as exc:
        logger.error(f"GA4 landing pages query failed: {exc}")

    return {
        "configured": True,
        "summary": summary,
        "channels": channels,
        "cities": cities,
        "countries": countries,
        "daily_traffic": daily_traffic,
        "devices": devices,
        "landing_pages": landing_pages,
    }
