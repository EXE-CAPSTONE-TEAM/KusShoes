from unittest.mock import patch

import pytest

from app.config import settings


@pytest.mark.asyncio
async def test_forgot_password_does_not_reveal_account(
    client, authenticated_user, mock_send_password_reset_email
):
    with patch("app.infrastructure.otp_store.generate_otp", return_value="123456"):
        existing = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": authenticated_user.email},
        )
    missing = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "missing@example.com"},
    )

    assert existing.status_code == 202
    assert missing.status_code == 202
    assert existing.json() == missing.json()
    mock_send_password_reset_email.assert_called_once_with(
        authenticated_user.email, "123456"
    )


@pytest.mark.asyncio
async def test_reset_password_revokes_existing_sessions(
    client, authenticated_user, mock_send_password_reset_email
):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    assert login.status_code == 200
    old_refresh = login.cookies.get(settings.REFRESH_COOKIE_NAME)

    with patch("app.infrastructure.otp_store.generate_otp", return_value="654321"):
        requested = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": authenticated_user.email},
        )
    assert requested.status_code == 202

    reset = await client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": authenticated_user.email,
            "otp_code": "654321",
            "new_password": "NewPassword2",
            "confirm_password": "NewPassword2",
        },
    )
    assert reset.status_code == 200

    old_session = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert old_session.status_code == 401
    old_password = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    assert old_password.status_code == 401
    new_password = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "NewPassword2"},
    )
    assert new_password.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_locks_after_five_wrong_codes(client, authenticated_user):
    with patch("app.infrastructure.otp_store.generate_otp", return_value="123456"):
        await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": authenticated_user.email},
        )

    payload = {
        "email": authenticated_user.email,
        "otp_code": "000000",
        "new_password": "NewPassword2",
        "confirm_password": "NewPassword2",
    }
    for _ in range(4):
        response = await client.post("/api/v1/auth/reset-password", json=payload)
        assert response.status_code == 400
    locked = await client.post("/api/v1/auth/reset-password", json=payload)
    assert locked.status_code == 429
    assert locked.json()["code"] == "AUTH_RESET_LOCKED"


@pytest.mark.asyncio
async def test_login_rate_limit_returns_retry_after(client, authenticated_user, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 2)
    payload = {"email": authenticated_user.email, "password": "WrongPassword1"}
    first = await client.post("/api/v1/auth/login", json=payload)
    second = await client.post("/api/v1/auth/login", json=payload)
    blocked = await client.post("/api/v1/auth/login", json=payload)

    assert first.status_code == 401
    assert second.status_code == 401
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "AUTH_RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) > 0


@pytest.mark.asyncio
async def test_missing_bearer_token_returns_401(client):
    response = await client.get("/api/v1/projects")
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_request_id_header_is_echoed(client):
    response = await client.get("/health", headers={"X-Request-ID": "test-request-id"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-request-id"


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_prometheus_text(client):
    await client.get("/health")
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "kusshoes_http_requests_total" in response.text


@pytest.mark.asyncio
async def test_list_and_revoke_login_sessions(client, authenticated_user):
    first = await client.post(
        "/api/v1/auth/login",
        headers={"User-Agent": "KusShoes-Web"},
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    second = await client.post(
        "/api/v1/auth/login",
        headers={"User-Agent": "KusShoes-Mobile"},
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    assert first.status_code == second.status_code == 200
    first_refresh = first.cookies.get(settings.REFRESH_COOKIE_NAME)
    second_refresh = second.cookies.get(settings.REFRESH_COOKIE_NAME)
    headers = {"Authorization": f"Bearer {first.json()['access_token']}"}

    sessions = await client.get("/api/v1/auth/sessions", headers=headers)
    assert sessions.status_code == 200
    by_agent = {item["user_agent"]: item for item in sessions.json()["items"]}
    assert {"KusShoes-Web", "KusShoes-Mobile"}.issubset(by_agent)

    revoked = await client.delete(
        f"/api/v1/auth/sessions/{by_agent['KusShoes-Mobile']['id']}", headers=headers
    )
    assert revoked.status_code == 200
    rejected = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": second_refresh},
    )
    assert rejected.status_code == 401

    revoked_all = await client.delete("/api/v1/auth/sessions", headers=headers)
    assert revoked_all.status_code == 200
    rejected_first = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first_refresh},
    )
    assert rejected_first.status_code == 401
