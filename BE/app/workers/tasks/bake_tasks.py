import asyncio
import uuid

import httpx

from app.database import AsyncSessionLocal
from app.services import bake_service
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.bake_tasks.bake_shoe", bind=True, max_retries=3)
def bake_shoe(self, job_id: str) -> dict:
    parsed_job_id = uuid.UUID(job_id)
    try:
        return asyncio.run(_run(parsed_job_id, self.request.id))
    except (httpx.HTTPError, TimeoutError) as exc:
        retries = int(self.request.retries or 0)
        max_retries = int(self.max_retries or 0)
        if retries >= max_retries:
            asyncio.run(_mark_failed(parsed_job_id, str(exc)))
            raise

        # process_bake leaves transient failures in processing state. Requeue
        # before asking Celery to redeliver, otherwise its claim guard rejects
        # the retry as a duplicate delivery.
        asyncio.run(_mark_retryable(parsed_job_id))
        delay = 10 * (2**retries)
        raise self.retry(exc=exc, countdown=delay)


async def _run(job_id: uuid.UUID, worker_id: str | None) -> dict:
    async with AsyncSessionLocal() as db:
        return await bake_service.process_bake(db, job_id, worker_id)


async def _mark_retryable(job_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        await bake_service.mark_retryable(db, job_id)


async def _mark_failed(job_id: uuid.UUID, message: str) -> None:
    async with AsyncSessionLocal() as db:
        await bake_service.mark_failed(db, job_id, message)
