import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure import storage
from app.repositories import maintenance_repo, plan_repo, project_repo


async def get_project_file_paths(db: AsyncSession, project_id: uuid.UUID) -> list[str]:
    return await maintenance_repo.list_project_file_paths(db, project_id)


async def get_scheduled_project_cleanup_paths(
    db: AsyncSession, project_id: uuid.UUID
) -> list[str]:
    project = await project_repo.get_deleted_by_id(db, project_id)
    if not project or not project.deleted_at:
        return []
    if project.deleted_at > datetime.now(UTC) - timedelta(days=7):
        return []
    return await maintenance_repo.list_project_file_paths(db, project_id)


async def get_user_file_paths(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    return await maintenance_repo.list_user_file_paths(db, user_id)


async def expire_subscriptions(db: AsyncSession) -> dict:
    subscriptions = await maintenance_repo.list_expired_subscriptions(
        db,
        at=datetime.now(UTC),
    )
    free_plan = await plan_repo.get_free_plan(db)
    if not free_plan:
        return {"status": "failed", "reason": "free_plan_not_found"}
    await maintenance_repo.downgrade_to_free(
        db,
        subscriptions,
        free_plan_id=free_plan.id,
    )
    await db.commit()
    return {"status": "completed", "expired": len(subscriptions)}


async def remove_stale_upload_records(db: AsyncSession) -> list[str]:
    paths = await maintenance_repo.delete_stale_uploads(
        db,
        before=datetime.now(UTC) - timedelta(hours=1),
    )
    await db.commit()
    return paths


def delete_paths(paths: list[str]) -> dict:
    deleted = 0
    failed = 0
    for path in set(paths):
        try:
            storage.delete_file(path)
            deleted += 1
        except Exception:
            failed += 1
    return {"status": "completed", "deleted": deleted, "failed": failed}


def delete_storage_file(file_path: str) -> dict:
    storage.delete_file(file_path)
    return {"status": "deleted", "file_path": file_path}
