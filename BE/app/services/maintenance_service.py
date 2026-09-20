import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure import storage, task_queue
from app.repositories import login_history_repo, maintenance_repo, plan_repo, project_repo


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


async def enter_grace_period(db: AsyncSession) -> dict:
    """BR-90: paid subscriptions whose cycle just ended get 3 days of
    read/edit/save access before falling back to Free (SF-09)."""
    now = datetime.now(UTC)
    subscriptions = await maintenance_repo.list_subscriptions_entering_grace(db, at=now)
    await maintenance_repo.enter_grace(db, subscriptions, at=now)
    await db.commit()
    for subscription in subscriptions:
        user = await _load_user_email(db, subscription.user_id)
        if user:
            task_queue.enqueue_grace_period_email(user)
    return {"status": "completed", "entered_grace": len(subscriptions)}


async def finalize_grace_expiry(db: AsyncSession) -> dict:
    """BR-27/BR-90: once the 3-day grace window elapses, downgrade to Free
    and lock any projects over the Free quota (most-recently-edited stay
    editable)."""
    now = datetime.now(UTC)
    subscriptions = await maintenance_repo.list_grace_expired(db, at=now)
    free_plan = await plan_repo.get_free_plan(db)
    if not free_plan:
        return {"status": "failed", "reason": "free_plan_not_found"}
    await maintenance_repo.downgrade_to_free(
        db, subscriptions, free_plan_id=free_plan.id, at=now
    )
    locked_total = 0
    for subscription in subscriptions:
        locked_total += await project_repo.lock_excess_for_user(
            db, subscription.user_id, free_plan.max_projects or 0
        )
    await db.commit()
    return {"status": "completed", "downgraded": len(subscriptions), "locked": locked_total}


async def send_renewal_reminders(db: AsyncSession) -> dict:
    """SF-17: email at T-3 and T-1 before expiry (T0 is covered by the
    grace-period notice above)."""
    now = datetime.now(UTC)
    sent = 0
    for days_before in (3, 1):
        window_start = now + timedelta(days=days_before)
        window_end = window_start + timedelta(days=1)
        rows = await maintenance_repo.list_expiring_for_reminder(
            db, window_start=window_start, window_end=window_end
        )
        for _subscription, email in rows:
            task_queue.enqueue_renewal_reminder_email(email, days_before)
            sent += 1
    return {"status": "completed", "reminders_sent": sent}


async def purge_old_login_history(db: AsyncSession) -> dict:
    """BR-18: login history is retained 90 days."""
    deleted = await login_history_repo.delete_older_than(db)
    await db.commit()
    return {"status": "completed", "deleted": deleted}


async def _load_user_email(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    from app.repositories import user_repo

    user = await user_repo.get_by_id(db, user_id)
    return user.email if user else None


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
