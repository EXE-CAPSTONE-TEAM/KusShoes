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
