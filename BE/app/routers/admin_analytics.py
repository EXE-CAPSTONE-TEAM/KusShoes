import json
from datetime import date, timedelta
from typing import Literal

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.dependencies import get_current_admin, get_redis
from app.schemas.analytics import (
    AnalyticsResponse,
    Ga4ConnectionTestResponse,
    MarketingAnalyticsResponse,
    RealtimeAnalyticsResponse,
)
from app.services import analytics_service, ga4_service, marketing_analytics_service, report_service
from app.utils.http import attachment_response

router = APIRouter()


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await analytics_service.get_analytics(db, date_from=date_from, date_to=date_to)


@router.get("/reports/{report_type}")
async def download_report(
    report_type: Literal["revenue", "users", "transactions", "channel-funnel", "api-cost"],
    format: Literal["csv", "xlsx", "pdf"] = "csv",
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    data, content_type, filename = await report_service.generate(
        db, report_type, format, date_from=date_from, date_to=date_to
    )
    return attachment_response(data, content_type, filename)


@router.get("/analytics/marketing", response_model=MarketingAnalyticsResponse)
async def get_marketing_analytics(
    date_from: date | None = None,
    date_to: date | None = None,
    country: str | None = None,
    refresh: bool = Query(False, description="Bypass Redis cache"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    admin=Depends(get_current_admin),
):
    """Hybrid marketing report aggregating GA4 traffic and internal DB conversions."""
    # Default to trailing 30 days if not supplied
    effective_to = date_to or date.today()
    effective_from = date_from or (date.today() - timedelta(days=29))
    if effective_from > effective_to:
        raise HTTPException(status_code=422, detail="date_from phải trước hoặc bằng date_to")

    cache_key = f"marketing_report:{effective_from}:{effective_to}:{country or 'all'}"

    if not refresh and redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass  # Fall back to computation if redis fails

    data = await marketing_analytics_service.get_marketing_report(
        db, date_from=effective_from, date_to=effective_to, country=country
    )

    if redis:
        try:
            await redis.set(cache_key, json.dumps(data), ex=900)  # TTL 15 minutes
        except Exception:
            pass

    return data


@router.get("/analytics/marketing/realtime", response_model=RealtimeAnalyticsResponse)
async def get_marketing_realtime(
    redis: aioredis.Redis = Depends(get_redis),
    admin=Depends(get_current_admin),
):
    """Get active realtime visitors in the last 30 minutes."""
    cache_key = "marketing_realtime"
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    data = await marketing_analytics_service.get_realtime_metrics()

    if redis:
        try:
            await redis.set(cache_key, json.dumps(data), ex=30)  # TTL 30 seconds
        except Exception:
            pass

    return data


@router.post("/analytics/marketing/test-connection", response_model=Ga4ConnectionTestResponse)
async def test_ga4_connection(
    admin=Depends(get_current_admin),
):
    """Test read access and verify configuration for Google Analytics 4."""
    return await run_in_threadpool(ga4_service.test_connection)

