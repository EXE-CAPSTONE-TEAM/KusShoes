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
                "filename": "shoe.glb",
                "content_type": "model/gltf-binary",
            },
        )
    assert upload.status_code == 200
    assert upload.json()["upload_url"] == "http://upload"
    asset_id = upload.json()["asset_id"]

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
