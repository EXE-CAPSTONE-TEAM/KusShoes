"""BR-94 daily Credit expiry (SRS_v2.2.txt:1617 "hạn dùng 12 tháng kể từ ngày mua").

Flips lapsed `available` Credits to `expired`. Reads already treat a past expires_at as
unavailable, so a missed run never lets an expired Credit be spent."""
import asyncio

from app.database import AsyncSessionLocal
from app.services import credit_service
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.credit_tasks.expire_scan_credits")
def expire_scan_credits() -> dict:
    return asyncio.run(_expire_scan_credits())


async def _expire_scan_credits() -> dict:
    async with AsyncSessionLocal() as db:
        return await credit_service.expire_due(db)
