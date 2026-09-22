"""SF-14 daily budget check (SRS_v2.2.txt:1767): 80% -> alert Admin once, 100% -> suspend
new Scan Job intake. Scheduled by celery beat "check-api-budget-daily"."""

import asyncio

from app.database import AsyncSessionLocal
from app.services import api_cost_service
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.api_cost_tasks.check_api_budget")
def check_api_budget() -> dict:
    return asyncio.run(_check_api_budget())


async def _check_api_budget() -> dict:
    async with AsyncSessionLocal() as db:
        return await api_cost_service.check_current_budget(db)
