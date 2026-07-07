from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest


async def _create_project(client, headers, name="P0 Shoe"):
    response = await client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": name, "description": "P0 flow"},
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_user_can_cancel_and_retry_bake_job(client, db, auth_headers):
    from app.repositories import bake_job_repo, project_repo

    project_id = await _create_project(client, auth_headers)
    project = await project_repo.get_by_id(db, project_id)
    queued = await bake_job_repo.create(
        db,
        project_id=project.id,
        design_config={"color": "red"},
        priority="normal",
    )
    await project_repo.set_status(db, project, "baking")
    await db.commit()

    status = await client.get(
        f"/api/v1/projects/{project_id}/bake/{queued.id}", headers=auth_headers
    )
    assert status.status_code == 200
    assert status.json()["can_cancel"] is True
    assert status.json()["poll_after_seconds"] == 3

    cancelled = await client.post(
        f"/api/v1/projects/{project_id}/bake/{queued.id}/cancel",
        headers=auth_headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    failed = await bake_job_repo.create(
        db,
        project_id=project.id,
        design_config={"color": "blue"},
        priority="normal",
    )
    bake_job_repo.mark_failed(failed, "worker failed")
    await db.commit()

    with patch("app.infrastructure.task_queue.enqueue_bake") as enqueue:
        retried = await client.post(
            f"/api/v1/projects/{project_id}/bake/{failed.id}/retry",
            headers=auth_headers,
        )
    assert retried.status_code == 202
    assert retried.json()["status"] == "queued"
    enqueue.assert_called_once_with(str(failed.id), "normal")

    invalid_retry = await client.post(
        f"/api/v1/projects/{project_id}/bake/{failed.id}/retry",
        headers=auth_headers,
    )
    assert invalid_retry.status_code == 409


@pytest.mark.asyncio
async def test_project_trash_and_restore_are_cleanup_safe(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import monthly_usage_repo, project_asset_repo
    from app.services import maintenance_service

    project_id = await _create_project(client, auth_headers)
    await project_asset_repo.create_upload(
        db,
        project_id=project_id,
        user_id=authenticated_user.id,
        asset_type="sticker",
        filename="safe.png",
        file_path="stickers/project/safe.png",
        content_type="image/png",
    )
    await db.commit()
    with patch("app.infrastructure.task_queue.enqueue_project_cleanup") as enqueue:
        deleted = await client.delete(
            f"/api/v1/projects/{project_id}", headers=auth_headers
        )
    assert deleted.status_code == 200
    enqueue.assert_called_once()

    trash = await client.get("/api/v1/projects/trash", headers=auth_headers)
    assert trash.status_code == 200
    assert trash.json()["items"][0]["id"] == project_id
    assert trash.json()["items"][0]["purge_at"]
    assert await maintenance_service.get_scheduled_project_cleanup_paths(db, project_id) == []

    restored = await client.post(
        f"/api/v1/projects/{project_id}/restore", headers=auth_headers
    )
    assert restored.status_code == 200
    assert restored.json()["id"] == project_id
    assert await maintenance_service.get_scheduled_project_cleanup_paths(db, project_id) == []

    usage = await monthly_usage_repo.get_or_create_current_month(db, authenticated_user.id)
    await db.refresh(usage)
    assert usage.projects_count == 1


@pytest.mark.asyncio
async def test_expired_trash_item_cannot_be_restored(client, db, auth_headers):
    from app.repositories import project_repo

    project_id = await _create_project(client, auth_headers)
    with patch("app.infrastructure.task_queue.enqueue_project_cleanup"):
        await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    project = await project_repo.get_deleted_by_id(db, project_id)
    project.deleted_at = datetime.now(UTC) - timedelta(days=8)
    await db.commit()

    restored = await client.post(
        f"/api/v1/projects/{project_id}/restore", headers=auth_headers
    )
    assert restored.status_code == 410
    assert restored.json()["code"] == "PROJ_RESTORE_EXPIRED"


@pytest.mark.asyncio
async def test_restore_respects_current_plan_quota(client, auth_headers):
    trashed_id = await _create_project(client, auth_headers, "Trashed")
    with patch("app.infrastructure.task_queue.enqueue_project_cleanup"):
        await client.delete(f"/api/v1/projects/{trashed_id}", headers=auth_headers)

    for index in range(3):
        await _create_project(client, auth_headers, f"Active {index}")

    restored = await client.post(
        f"/api/v1/projects/{trashed_id}/restore", headers=auth_headers
    )
    assert restored.status_code == 403
    assert restored.json()["code"] == "PROJ_QUOTA_EXCEEDED"


@pytest.mark.asyncio
async def test_permanent_delete_removes_records_and_enqueues_storage_cleanup(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import (
        bake_job_repo,
        export_record_repo,
        project_asset_repo,
        project_repo,
    )

    project_id = await _create_project(client, auth_headers, "Delete forever")
    project = await project_repo.get_by_id(db, project_id)
    project.thumbnail_path = "thumbnails/project.png"
    asset = await project_asset_repo.create_upload(
        db,
        project_id=project.id,
        user_id=authenticated_user.id,
        asset_type="sticker",
        filename="sticker.png",
        file_path="stickers/project/sticker.png",
        content_type="image/png",
    )
    await project_asset_repo.mark_ready(db, asset, file_size_bytes=123)
    job = await bake_job_repo.create(
        db,
        project_id=project.id,
        design_config={},
        priority="low",
    )
    bake_job_repo.mark_completed(job)
    exports = await export_record_repo.create_many(
        db,
        project_id=project.id,
        bake_job_id=job.id,
        user_id=authenticated_user.id,
        exports=[
            {
                "format": "glb",
                "file_path": "exports/project/model.glb",
                "file_size_bytes": 456,
            }
        ],
    )
    await db.commit()

    with patch("app.infrastructure.task_queue.enqueue_project_cleanup"):
        await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    with patch("app.infrastructure.task_queue.enqueue_storage_delete") as enqueue_delete:
        removed = await client.delete(
            f"/api/v1/projects/{project_id}/permanent", headers=auth_headers
        )
    assert removed.status_code == 200
    assert await project_repo.get_by_id_any(db, project.id) is None
    assert await bake_job_repo.get_by_id(db, job.id) is None
    assert await export_record_repo.get_for_user(
        db, exports[0].id, authenticated_user.id
    ) is None
    assert await project_asset_repo.get_by_id(db, asset.id) is None
    assert {call.args[0] for call in enqueue_delete.call_args_list} == {
        "thumbnails/project.png",
        "stickers/project/sticker.png",
        "exports/project/model.glb",
    }


@pytest.mark.asyncio
async def test_global_export_history_and_download_tracking(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import bake_job_repo, export_record_repo, project_repo

    first_project_id = await _create_project(client, auth_headers, "First Shoe")
    second_project_id = await _create_project(client, auth_headers, "Second Shoe")
    records = []
    for project_id, export_format in (
        (first_project_id, "glb"),
        (second_project_id, "obj"),
    ):
        project = await project_repo.get_by_id(db, project_id)
        job = await bake_job_repo.create(
            db, project_id=project.id, design_config={}, priority="low"
        )
        bake_job_repo.mark_completed(job)
        records.extend(
            await export_record_repo.create_many(
                db,
                project_id=project.id,
                bake_job_id=job.id,
                user_id=authenticated_user.id,
                exports=[
                    {
                        "format": export_format,
                        "file_path": f"exports/{project.id}/model.{export_format}",
                        "file_size_bytes": 100,
                    }
                ],
            )
        )
    await db.commit()

    first_page = await client.get("/api/v1/exports?limit=1", headers=auth_headers)
    assert first_page.status_code == 200
    assert first_page.json()["has_next"] is True
    assert first_page.json()["items"][0]["project_name"] in {"First Shoe", "Second Shoe"}
    cursor = first_page.json()["next_cursor"]
    second_page = await client.get(
        f"/api/v1/exports?limit=1&cursor={cursor}", headers=auth_headers
    )
    assert second_page.status_code == 200
    assert second_page.json()["items"][0]["id"] != first_page.json()["items"][0]["id"]

    filtered = await client.get("/api/v1/exports?format=glb", headers=auth_headers)
    assert filtered.status_code == 200
    assert [item["format"] for item in filtered.json()["items"]] == ["glb"]

    with patch(
        "app.infrastructure.storage.generate_presigned_download_url",
        return_value="https://storage.test/download",
    ):
        download = await client.post(
            f"/api/v1/exports/{records[0].id}/download-url", headers=auth_headers
        )
    assert download.status_code == 200
    assert download.json()["download_url"] == "https://storage.test/download"
    await db.refresh(records[0])
    assert records[0].download_count == 1
