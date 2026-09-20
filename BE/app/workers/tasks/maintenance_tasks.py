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


@celery_app.task(name="app.workers.tasks.maintenance_tasks.enter_grace_period")
def enter_grace_period() -> dict:
    return asyncio.run(_enter_grace_period())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.finalize_grace_expiry")
def finalize_grace_expiry() -> dict:
    return asyncio.run(_finalize_grace_expiry())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.send_renewal_reminders")
def send_renewal_reminders() -> dict:
    return asyncio.run(_send_renewal_reminders())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.cancel_stale_pending_invoices")
def cancel_stale_pending_invoices() -> dict:
    return asyncio.run(_cancel_stale_pending_invoices())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.purge_old_login_history")
def purge_old_login_history() -> dict:
    return asyncio.run(_purge_old_login_history())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.purge_expired_trash")
def purge_expired_trash() -> dict:
    return asyncio.run(_purge_expired_trash())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.purge_deleted_accounts")
def purge_deleted_accounts() -> dict:
    return asyncio.run(_purge_deleted_accounts())


@celery_app.task(name="app.workers.tasks.maintenance_tasks.cleanup_stale_uploads")
def cleanup_stale_uploads() -> dict:
    return asyncio.run(_cleanup_stale_uploads())


async def _cleanup_project_files(project_id: uuid.UUID) -> dict:
    async with AsyncSessionLocal() as db:
        paths = await maintenance_service.get_scheduled_project_cleanup_paths(db, project_id)
    return maintenance_service.delete_paths(paths)


async def _cleanup_user_files(user_id: uuid.UUID) -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.finalize_account_deletion(db, user_id)


async def _enter_grace_period() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.enter_grace_period(db)


async def _finalize_grace_expiry() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.finalize_grace_expiry(db)


async def _send_renewal_reminders() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.send_renewal_reminders(db)


async def _cancel_stale_pending_invoices() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.cancel_stale_pending_invoices(db)


async def _purge_old_login_history() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.purge_old_login_history(db)


async def _cleanup_stale_uploads() -> dict:
    async with AsyncSessionLocal() as db:
        paths = await maintenance_service.remove_stale_upload_records(db)
    return maintenance_service.delete_paths(paths)


async def _purge_expired_trash() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.purge_expired_trash(db)


async def _purge_deleted_accounts() -> dict:
    async with AsyncSessionLocal() as db:
        return await maintenance_service.purge_deleted_accounts(db)
