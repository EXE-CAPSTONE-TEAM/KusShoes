import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure import storage, task_queue
from app.policy import ACCOUNT_RESTORE_DAYS, PROJECT_RESTORE_DAYS
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    login_history_repo,
    maintenance_repo,
    plan_repo,
    project_asset_repo,
    project_repo,
    refresh_token_repo,
    user_repo,
)


async def get_project_file_paths(db: AsyncSession, project_id: uuid.UUID) -> list[str]:
    return await maintenance_repo.list_project_file_paths(db, project_id)


async def get_scheduled_project_cleanup_paths(
    db: AsyncSession, project_id: uuid.UUID
) -> list[str]:
    project = await project_repo.get_deleted_by_id(db, project_id)
    if not project or not project.deleted_at:
        return []
    if project.deleted_at > datetime.now(UTC) - timedelta(days=PROJECT_RESTORE_DAYS):
        return []
    return await maintenance_repo.list_project_file_paths(db, project_id)


async def get_user_file_paths(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    return await maintenance_repo.list_user_file_paths(db, user_id)


async def _purge_project_rows(db: AsyncSession, project) -> list[str]:
    paths = await maintenance_repo.list_project_file_paths(db, project.id)
    await project_repo.clear_canonical_asset(db, project)
    await export_record_repo.delete_for_project(db, project.id)
    await bake_job_repo.delete_for_project(db, project.id)
    await project_asset_repo.delete_for_project(db, project.id)
    await project_repo.hard_delete(db, project)
    return paths


async def purge_expired_trash(db: AsyncSession) -> dict:
    """BR-47: trashed projects are gone for good after the restore window."""
    cutoff = datetime.now(UTC) - timedelta(days=PROJECT_RESTORE_DAYS)
    projects = await project_repo.list_expired_trash(db, deleted_before=cutoff)
    paths: list[str] = []
    for project in projects:
        paths.extend(await _purge_project_rows(db, project))
    await db.commit()
    delete_paths(paths)
    return {"status": "completed", "projects_purged": len(projects)}


async def finalize_account_deletion(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """BR-06: after 30 days, wipe files/projects and anonymize the row. A
    restored account (deleted_at cleared) or a re-deleted one still inside its
    window is skipped, so a stale scheduled task can never purge live data."""
    user = await user_repo.get_by_id_any(db, user_id)
    cutoff = datetime.now(UTC) - timedelta(days=ACCOUNT_RESTORE_DAYS)
    if not user or user.deleted_at is None or user.deleted_at > cutoff:
        return {"status": "skipped"}
    paths = await maintenance_repo.list_user_file_paths(db, user.id)
    project_ids = await maintenance_repo.list_project_ids_for_user(db, user.id)
    for project_id in project_ids:
        project = await project_repo.get_by_id_any(db, project_id)
        if project:
            await _purge_project_rows(db, project)
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    await user_repo.anonymize(db, user)
    await db.commit()
    return {"status": "completed", **delete_paths(paths)}


async def purge_deleted_accounts(db: AsyncSession) -> dict:
    cutoff = datetime.now(UTC) - timedelta(days=ACCOUNT_RESTORE_DAYS)
    users = await user_repo.list_purgeable(db, deleted_before=cutoff)
    purged = 0
    for user in users:
        result = await finalize_account_deletion(db, user.id)
        purged += result["status"] == "completed"
    return {"status": "completed", "accounts_purged": purged}


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


async def cancel_stale_pending_invoices(db: AsyncSession) -> dict:
    from app.services import billing_service

    cancelled = await billing_service.cancel_stale_pending_invoices(db)
    return {"status": "completed", "cancelled": cancelled}


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


def extract_staging_keys(issued_outputs: Any) -> list[str]:
    if not issued_outputs:
        return []
    if isinstance(issued_outputs, str):
        return [issued_outputs]
    if isinstance(issued_outputs, dict):
        path = issued_outputs.get("file_path")
        return [str(path)] if path else []
    if not isinstance(issued_outputs, (list, tuple, set)):
        return []
    keys: list[str] = []
    for item in issued_outputs:
        if isinstance(item, dict) and item.get("file_path"):
            keys.append(str(item["file_path"]))
        elif isinstance(item, str):
            keys.append(item)
    return keys


async def sweep_expired_claims(
    db: AsyncSession,
    *,
    before: datetime | None = None,
) -> list[str]:
    """Spec §A.9: Sweep abandoned claimed bake jobs.

    Conditionally sets status='failed' where status='claimed' and
    claim_expires_at < now - CLAIM_LEASE_SECONDS. Deletes exactly the row's
    issued_outputs keys and resets project status.
    """
    if before is None:
        # provenance: spec §Parameter & Data Provenance "Sweep threshold", claim_expires_at < now - CLAIM_LEASE_SECONDS
        before = datetime.now(UTC) - timedelta(seconds=settings.CLAIM_LEASE_SECONDS)

    swept = await bake_job_repo.sweep_expired_claims(db, before=before)
    if not swept:
        return []

    project_ids = {row[1] for row in swept}
    await project_repo.reset_status_for_projects(db, project_ids)

    await db.commit()

    staging_paths: list[str] = []
    for row in swept:
        staging_paths.extend(extract_staging_keys(row[2]))
    return staging_paths


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
