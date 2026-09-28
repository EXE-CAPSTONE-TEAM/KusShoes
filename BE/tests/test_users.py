from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_get_and_update_profile(client, auth_headers):
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["total_designs"] == 0

    response = await client.patch(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "first_name": "Updated",
            "bio": "Shoe designer",
            "preferred_styles": ["Streetwear", "streetwear", "Minimal"],
        },
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "Updated"
    assert response.json()["preferred_styles"] == ["streetwear", "minimal"]


@pytest.mark.asyncio
async def test_profile_usage(client, auth_headers):
    response = await client.get("/api/v1/users/me/usage", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["tier"] == "free"
    assert body["projects_count"] == 0
    assert body["exports_count"] == 0
    assert body["storage_used_bytes"] == 0


@pytest.mark.asyncio
async def test_usage_reports_stored_bytes(client, auth_headers, authenticated_user, db):
    from app.repositories import bake_job_repo, export_record_repo, project_asset_repo

    project = (
        await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Storage"})
    ).json()
    project_id = project["id"]

    async def add_asset(status: str, size: int):
        asset = await project_asset_repo.create_upload(
            db,
            project_id=project_id,
            user_id=authenticated_user.id,
            asset_type="source_model",
            filename="m.glb",
            file_path=f"source_models/{project_id}/{status}.glb",
            content_type="model/gltf-binary",
        )
        asset.status = status
        asset.file_size_bytes = size

    await add_asset("ready", 1_000)
    await add_asset("raw", 200)
    await add_asset("uploading", 50_000)  # presigned URL only, nothing stored yet
    await add_asset("failed", 70_000)
    job = await bake_job_repo.create(db, project_id=project_id, design_config={}, priority="low")
    await export_record_repo.create_many(
        db,
        project_id=project_id,
        bake_job_id=job.id,
        user_id=authenticated_user.id,
        exports=[
            {"format": "glb", "file_path": "exports/a.glb", "file_size_bytes": 30},
            {"format": "obj", "file_path": "exports/a.obj"},  # size unknown counts as 0
        ],
    )
    await db.commit()

    body = (await client.get("/api/v1/users/me/usage", headers=auth_headers)).json()
    assert body["storage_used_bytes"] == 1_000 + 200 + 30


@pytest.mark.asyncio
async def test_change_password(client, auth_headers):
    response = await client.put(
        "/api/v1/users/me/password",
        headers=auth_headers,
        json={
            "current_password": "Password1",
            "new_password": "NewPassword2",
            "confirm_password": "NewPassword2",
        },
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_soft_delete_user_blocks_token(client, auth_headers):
    with patch("app.infrastructure.task_queue.enqueue_user_cleanup"):
        response = await client.request(
            "DELETE",
            "/api/v1/users/me",
            headers=auth_headers,
            json={"password": "Password1"},
        )
    assert response.status_code == 200
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 401
