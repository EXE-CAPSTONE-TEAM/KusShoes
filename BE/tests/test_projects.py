from unittest.mock import patch

import pytest


async def _create_project(client, headers, name="My Shoe"):
    return await client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": name, "description": "Custom design"},
    )


@pytest.mark.asyncio
async def test_project_crud_and_usage(client, db, auth_headers, authenticated_user):
    response = await _create_project(client, auth_headers)
    assert response.status_code == 201
    project_id = response.json()["id"]

    listing = await client.get("/api/v1/projects?limit=1", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.json()["items"]) == 1

    updated = await client.patch(
        f"/api/v1/projects/{project_id}",
        headers=auth_headers,
        json={"name": "Updated Shoe"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated Shoe"

    from app.repositories import monthly_usage_repo

    usage = await monthly_usage_repo.get_or_create_current_month(db, authenticated_user.id)
    await db.refresh(usage)
    assert usage.projects_count == 1

    with patch("app.infrastructure.task_queue.enqueue_project_cleanup"):
        deleted = await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert deleted.status_code == 200
    await db.refresh(usage)
    assert usage.projects_count == 0


@pytest.mark.asyncio
async def test_project_quota(client, auth_headers):
    for index in range(3):
        assert (await _create_project(client, auth_headers, f"Shoe {index}")).status_code == 201
    response = await _create_project(client, auth_headers, "Over quota")
    assert response.status_code == 403
    assert response.json()["code"] == "PROJ_QUOTA_EXCEEDED"


@pytest.mark.asyncio
async def test_project_ownership(client, db, auth_headers):
    project_id = (await _create_project(client, auth_headers)).json()["id"]

    import bcrypt

    from app.repositories import user_repo
    from app.utils.jwt import create_access_token

    other = await user_repo.create_email_user(
        db,
        email="other@example.com",
        username="otheruser",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Other",
        last_name="User",
    )
    other.is_verified = True
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(other.id))}"}
    response = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_save_design_and_trigger_bake(client, service_headers, auth_headers):
    project_id = (await _create_project(client, auth_headers)).json()["id"]
    saved = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": {"color": "red"}, "thumbnail_path": "thumbs/a.png"},
    )
    assert saved.status_code == 200

    with patch("app.infrastructure.task_queue.enqueue_bake"):
        first = await client.post(
            f"/api/v1/projects/{project_id}/bake",
            headers=service_headers,
            json={"design_config": {"color": "red"}},
        )
        second = await client.post(
            f"/api/v1/projects/{project_id}/bake",
            headers=service_headers,
            json={"design_config": {"color": "red"}},
        )
    assert first.status_code == 202
    assert second.status_code == 409
