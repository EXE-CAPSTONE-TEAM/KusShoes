import asyncio
import uuid

import httpx

from app.database import AsyncSessionLocal
from app.services import bake_service
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.bake_tasks.bake_shoe", bind=True, max_retries=3)
def bake_shoe(self, job_id: str) -> dict:
    try:
        return asyncio.run(_run(uuid.UUID(job_id), self.request.id))
    except (httpx.HTTPError, TimeoutError) as exc:
        delay = 10 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


async def _run(job_id: uuid.UUID, worker_id: str | None) -> dict:
    async with AsyncSessionLocal() as db:
        return await bake_service.process_bake(db, job_id, worker_id)

