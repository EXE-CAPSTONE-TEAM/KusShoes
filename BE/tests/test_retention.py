import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from app.services import maintenance_service


async def _delete_account(client, auth_headers, days_ago: int, db, user):
    response = await client.request(
        "DELETE", "/api/v1/users/me", headers=auth_headers, json={"password": "Password1"}
    )
    assert response.status_code == 200, response.text
    user.deleted_at = datetime.now(UTC) - timedelta(days=days_ago)
    await db.commit()


@pytest.mark.asyncio
async def test_restore_account_within_window(
    client, db, auth_headers, authenticated_user, mock_send_account_restore_email
):
    await _delete_account(client, auth_headers, 5, db, authenticated_user)

    requested = await client.post(
        "/api/v1/auth/restore-account/request", json={"email": authenticated_user.email}
    )
    assert requested.status_code == 202
    code = mock_send_account_restore_email.call_args.args[1]

    wrong = await client.post(
        "/api/v1/auth/restore-account/confirm",
        json={"email": authenticated_user.email, "otp_code": "000000"},
    )
    assert wrong.status_code == 400

    ok = await client.post(
        "/api/v1/auth/restore-account/confirm",
        json={"email": authenticated_user.email, "otp_code": code},
    )
    assert ok.status_code == 200
    await db.refresh(authenticated_user)
    assert authenticated_user.deleted_at is None


@pytest.mark.asyncio
async def test_restore_request_is_silent_after_window(
    client, db, auth_headers, authenticated_user, mock_send_account_restore_email
):
    await _delete_account(client, auth_headers, 31, db, authenticated_user)
    response = await client.post(
        "/api/v1/auth/restore-account/request", json={"email": authenticated_user.email}
    )
    assert response.status_code == 202  # same answer — no enumeration
    mock_send_account_restore_email.assert_not_called()


@pytest.mark.asyncio
async def test_finalize_skips_restored_and_recent_accounts(db, authenticated_user):
    # Restored account (deleted_at is None): a stale scheduled task must not touch it.
    result = await maintenance_service.finalize_account_deletion(db, authenticated_user.id)
    assert result["status"] == "skipped"

    authenticated_user.deleted_at = datetime.now(UTC) - timedelta(days=3)
    await db.commit()
    result = await maintenance_service.finalize_account_deletion(db, authenticated_user.id)
    assert result["status"] == "skipped"
    await db.refresh(authenticated_user)
    assert not authenticated_user.email.endswith("@deleted.invalid")


@pytest.mark.asyncio
async def test_finalize_anonymizes_after_30_days(
    db, authenticated_user
):
    authenticated_user.deleted_at = datetime.now(UTC) - timedelta(days=31)
    await db.commit()
    with patch("app.infrastructure.storage.delete_file"):
        result = await maintenance_service.purge_deleted_accounts(db)
    assert result["accounts_purged"] == 1
    await db.refresh(authenticated_user)
    assert authenticated_user.email.endswith("@deleted.invalid")
    assert authenticated_user.password_hash is None
    assert authenticated_user.first_name == "Deleted"


@pytest.mark.asyncio
async def test_trash_retention_is_30_days(client, db, auth_headers):
    from app.repositories import project_repo
    from app.services.project_service import PROJECT_RESTORE_DAYS

    assert PROJECT_RESTORE_DAYS == 30
    created = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Old"})
    project_id = created.json()["id"]
    await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)

    project = await project_repo.get_deleted_by_id(db, uuid.UUID(project_id))
    project.deleted_at = datetime.now(UTC) - timedelta(days=20)
    await db.commit()
    restored = await client.post(f"/api/v1/projects/{project_id}/restore", headers=auth_headers)
    assert restored.status_code == 200

    await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    project = await project_repo.get_deleted_by_id(db, uuid.UUID(project_id))
    project.deleted_at = datetime.now(UTC) - timedelta(days=31)
    await db.commit()
    expired = await client.post(f"/api/v1/projects/{project_id}/restore", headers=auth_headers)
    assert expired.status_code == 410

    with patch("app.infrastructure.storage.delete_file"):
        purged = await maintenance_service.purge_expired_trash(db)
    assert purged["projects_purged"] == 1
    assert await project_repo.get_by_id_any(db, uuid.UUID(project_id)) is None
