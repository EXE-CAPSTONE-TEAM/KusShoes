from unittest.mock import patch

import pytest

from app.infrastructure.storage import ObjectMetadata, ObjectNotFoundError


@pytest.mark.asyncio
async def test_asset_upload_confirm_and_delete(client, db, auth_headers):
    project = await client.post(
        "/api/v1/projects", headers=auth_headers, json={"name": "Asset Project"}
    )
    project_id = project.json()["id"]

    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://upload",
    ):
        upload = await client.post(
            f"/api/v1/projects/{project_id}/assets/upload-url",
            headers=auth_headers,
            json={
                "asset_type": "source_model",
                "filename": "..\\unsafe<script>.glb",
                "content_type": "model/gltf-binary",
            },
        )
    assert upload.status_code == 200
    assert upload.json()["upload_url"] == "http://upload"
    asset_id = upload.json()["asset_id"]

    listed = await client.get(f"/api/v1/projects/{project_id}/assets", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["original_filename"] == "unsafescript.glb"

    with (
        patch(
            "app.infrastructure.storage.get_object_metadata",
            side_effect=ObjectNotFoundError("missing"),
        ),
        patch("app.infrastructure.storage.read_object_prefix", return_value=b""),
    ):
        missing = await client.post(
            f"/api/v1/projects/{project_id}/assets/confirm",
            headers=auth_headers,
            json={"asset_id": asset_id, "file_size_bytes": 1000},
        )
    assert missing.status_code == 422

    with (
        patch(
            "app.infrastructure.storage.get_object_metadata",
            return_value=ObjectMetadata(
                size_bytes=1000,
                content_type="model/gltf-binary",
            ),
        ),
        patch("app.infrastructure.storage.read_object_prefix", return_value=b"glTF"),
    ):
        confirmed = await client.post(
            f"/api/v1/projects/{project_id}/assets/confirm",
            headers=auth_headers,
            json={"asset_id": asset_id, "file_size_bytes": 1000},
        )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "ready"

    from app.repositories import project_repo

    stored_project = await project_repo.get_by_id(db, project_id)
    await db.refresh(stored_project)
    assert str(stored_project.canonical_model_asset_id) == asset_id

    with patch("app.infrastructure.task_queue.enqueue_storage_delete"):
        deleted = await client.delete(
            f"/api/v1/projects/{project_id}/assets/{asset_id}", headers=auth_headers
        )
    assert deleted.status_code == 200


@pytest.mark.asyncio
async def test_locked_project_blocks_asset_mutations(client, db, auth_headers):
    from app.repositories import project_repo

    project = await client.post(
        "/api/v1/projects", headers=auth_headers, json={"name": "Locked Asset Project"}
    )
    project_id = project.json()["id"]

    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://upload",
    ):
        upload = await client.post(
            f"/api/v1/projects/{project_id}/assets/upload-url",
            headers=auth_headers,
            json={
                "asset_type": "source_model",
                "filename": "model.glb",
                "content_type": "model/gltf-binary",
            },
        )
    asset_id = upload.json()["asset_id"]

    stored_project = await project_repo.get_by_id(db, project_id)
    stored_project.is_locked = True
    await db.commit()

    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://upload",
    ):
        blocked_upload = await client.post(
            f"/api/v1/projects/{project_id}/assets/upload-url",
            headers=auth_headers,
            json={
                "asset_type": "source_model",
                "filename": "model2.glb",
                "content_type": "model/gltf-binary",
            },
        )
    assert blocked_upload.status_code == 403
    assert blocked_upload.json()["code"] == "PROJECT_LOCKED"

    blocked_confirm = await client.post(
        f"/api/v1/projects/{project_id}/assets/confirm",
        headers=auth_headers,
        json={"asset_id": asset_id, "file_size_bytes": 1000},
    )
    assert blocked_confirm.status_code == 403
    assert blocked_confirm.json()["code"] == "PROJECT_LOCKED"

    blocked_delete = await client.delete(
        f"/api/v1/projects/{project_id}/assets/{asset_id}", headers=auth_headers
    )
    assert blocked_delete.status_code == 403
    assert blocked_delete.json()["code"] == "PROJECT_LOCKED"

    # Reading a locked project's assets is still allowed (BR-27: view-only, not hidden).
    listed = await client.get(f"/api/v1/projects/{project_id}/assets", headers=auth_headers)
    assert listed.status_code == 200


WEBP_PREFIX = b"RIFF\x00\x00\x00\x00WEBPVP8 "


async def _upload_thumbnail(client, auth_headers, project_id, filename="thumbnail.webp"):
    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://upload",
    ):
        upload = await client.post(
            f"/api/v1/projects/{project_id}/assets/upload-url",
            headers=auth_headers,
            json={"asset_type": "thumbnail", "filename": filename, "content_type": "image/webp"},
        )
    assert upload.status_code == 200
    with (
        patch(
            "app.infrastructure.storage.get_object_metadata",
            return_value=ObjectMetadata(size_bytes=2048, content_type="image/webp"),
        ),
        patch("app.infrastructure.storage.read_object_prefix", return_value=WEBP_PREFIX),
    ):
        confirmed = await client.post(
            f"/api/v1/projects/{project_id}/assets/confirm",
            headers=auth_headers,
            json={"asset_id": upload.json()["asset_id"], "file_size_bytes": 2048},
        )
    assert confirmed.status_code == 200
    return confirmed.json()


@pytest.mark.asyncio
async def test_thumbnail_upload_becomes_project_thumbnail(client, db, auth_headers):
    project = await client.post(
        "/api/v1/projects", headers=auth_headers, json={"name": "Scanned Shoe"}
    )
    project_id = project.json()["id"]

    first = await _upload_thumbnail(client, auth_headers, project_id)
    assert first["asset_type"] == "thumbnail"
    fetched = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert fetched.json()["thumbnail_path"] == first["file_path"]

    # A re-save replaces the thumbnail and deletes the previous file instead of piling up.
    with patch("app.infrastructure.task_queue.enqueue_storage_delete") as enqueue_delete:
        second = await _upload_thumbnail(client, auth_headers, project_id)
    enqueue_delete.assert_called_once_with(first["file_path"])
    fetched = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert fetched.json()["thumbnail_path"] == second["file_path"]
    listed = await client.get(f"/api/v1/projects/{project_id}/assets", headers=auth_headers)
    thumbnails = [a for a in listed.json()["items"] if a["asset_type"] == "thumbnail"]
    assert [a["id"] for a in thumbnails] == [second["id"]]


@pytest.mark.asyncio
async def test_thumbnail_rejects_non_image(client, auth_headers):
    project = await client.post(
        "/api/v1/projects", headers=auth_headers, json={"name": "Scanned Shoe"}
    )
    upload = await client.post(
        f"/api/v1/projects/{project.json()['id']}/assets/upload-url",
        headers=auth_headers,
        json={
            "asset_type": "thumbnail",
            "filename": "thumbnail.glb",
            "content_type": "model/gltf-binary",
        },
    )
    assert upload.status_code == 422
