import asyncio
import uuid

from app.database import AsyncSessionLocal
from app.services import maintenance_service
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.maintenance_tasks.delete_storage_file")
def delete_storage_file(file_path: str) -> dict:
    return maintenance_service.delete_storage_file(file_path)


@celery_app.task(name="app.workers.tasks.maintenance_tasks.cleanup_project_files")
def cleanup_project_files(project_id: str) -> dict:
    return asyncio.run(_cleanup_project_files(uuid.UUID(project_id)))


@celery_app.task(name="app.workers.tasks.maintenance_tasks.cleanup_user_files")
def cleanup_user_files(user_id: str) -> dict:
    return asyncio.run(_cleanup_user_files(uuid.UUID(user_id)))


@celery_app.task(name="app.workers.tasks.maintenance_tasks.expire_subscriptions")
def expire_subscriptions() -> dict:
    return asyncio.run(_expire_subscriptions())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.cleanup_stale_uploads")
def cleanup_stale_uploads() -> dict:
    return asyncio.run(_cleanup_stale_uploads())


async def _cleanup_project_files(project_id: uuid.UUID) -> dict:
    async with AsyncSessionLocal() as db:
        paths = await maintenance_service.get_scheduled_project_cleanup_paths(db, project_id)
    return maintenance_service.delete_paths(paths)


async def _cleanup_user_files(user_id: uuid.UUID) -> dict:
    async with AsyncSessionLocal() as db:
        paths = await maintenance_service.get_user_file_paths(db, user_id)
    return maintenance_service.delete_paths(paths)


async def _expire_subscriptions() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.expire_subscriptions(db)


async def _cleanup_stale_uploads() -> dict:
    async with AsyncSessionLocal() as db:
        paths = await maintenance_service.remove_stale_upload_records(db)
    return maintenance_service.delete_paths(paths)
