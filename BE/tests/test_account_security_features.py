from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_login_locks_account_after_five_wrong_passwords(client, db, authenticated_user):
    payload = {"email": authenticated_user.email, "password": "WrongPassword1"}
    with patch("app.infrastructure.task_queue.enqueue_account_locked_email") as mock_email:
        for _ in range(5):
            response = await client.post("/api/v1/auth/login", json=payload)
            assert response.status_code == 401
        locked = await client.post("/api/v1/auth/login", json=payload)
    assert locked.status_code == 429
    assert locked.json()["code"] == "AUTH_ACCOUNT_LOCKED"
    mock_email.assert_called_once()

    from app.repositories import login_history_repo

    history = await login_history_repo.list_for_user(db, authenticated_user.id)
    assert len(history) == 5
    assert all(not entry.success for entry in history)


@pytest.mark.asyncio
async def test_successful_login_records_history_and_new_device_email(
    client, authenticated_user
):
    with patch("app.infrastructure.task_queue.enqueue_new_device_login_email") as mock_email:
        response = await client.post(
            "/api/v1/auth/login",
            headers={"User-Agent": "KusShoes-Test-Device"},
            json={"email": authenticated_user.email, "password": "Password1"},
        )
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert response.json()["mfa_required"] is False
    mock_email.assert_called_once()


@pytest.mark.asyncio
async def test_privacy_settings_default_off_and_updatable(client, auth_headers):
    initial = await client.get("/api/v1/users/me/privacy", headers=auth_headers)
    assert initial.status_code == 200
    assert all(v is False for v in initial.json().values())

    updated = await client.patch(
        "/api/v1/users/me/privacy",
        headers=auth_headers,
        json={"is_profile_public": True, "allow_analytics": True},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["is_profile_public"] is True
    assert body["allow_analytics"] is True
    assert body["is_searchable"] is False


@pytest.mark.asyncio
async def test_username_change_rejects_reserved_word(client, auth_headers):
    response = await client.patch(
        "/api/v1/users/me", headers=auth_headers, json={"username": "admin"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "USERNAME_RESERVED"


@pytest.mark.asyncio
async def test_username_change_enforces_cooldown(client, auth_headers):
    first = await client.patch(
        "/api/v1/users/me", headers=auth_headers, json={"username": "freshhandle1"}
    )
    assert first.status_code == 200

    second = await client.patch(
        "/api/v1/users/me", headers=auth_headers, json={"username": "freshhandle2"}
    )
    assert second.status_code == 429
    assert second.json()["code"] == "USERNAME_CHANGE_COOLDOWN"


@pytest.mark.asyncio
async def test_username_change_is_case_insensitive_unique(client, db, auth_headers):
    from app.repositories import user_repo

    other = await user_repo.create_email_user(
        db,
        email="taken@example.com",
        username="TakenName",
        password_hash="x",
        first_name="Taken",
        last_name="User",
    )
    other.is_verified = True
    await db.commit()

    response = await client.patch(
        "/api/v1/users/me", headers=auth_headers, json={"username": "takenname"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "AUTH_USERNAME_TAKEN"


@pytest.mark.asyncio
async def test_consent_grant_and_revoke(client, auth_headers):
    granted = await client.post(
        "/api/v1/users/me/consents",
        headers=auth_headers,
        json={"type": "marketing_content", "granted": True},
    )
    assert granted.status_code == 200
    assert granted.json()["revoked_at"] is None

    listed = await client.get("/api/v1/users/me/consents", headers=auth_headers)
    assert listed.status_code == 200
    assert any(c["type"] == "marketing_content" for c in listed.json())

    revoked = await client.post(
        "/api/v1/users/me/consents",
        headers=auth_headers,
        json={"type": "marketing_content", "granted": False},
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None


@pytest.mark.asyncio
async def test_login_history_masks_last_ip_octet(client, db, auth_headers, authenticated_user):
    from app.repositories import login_history_repo

    await login_history_repo.record(
        db,
        user_id=authenticated_user.id,
        email_attempted=authenticated_user.email,
        success=True,
        ip_address="203.113.45.67",
        user_agent="TestAgent",
    )
    await db.commit()

    response = await client.get("/api/v1/users/me/login-history", headers=auth_headers)
    assert response.status_code == 200
    item = next(i for i in response.json()["items"] if i["ip_address"] and "203.113.45" in i["ip_address"])
    assert item["ip_address"] == "203.113.45.xxx"


@pytest.mark.asyncio
async def test_data_export_returns_download_url(client, auth_headers):
    with patch("app.infrastructure.storage.upload_bytes") as mock_upload, patch(
        "app.infrastructure.storage.generate_presigned_download_url",
        return_value="https://storage.example/export.zip",
    ):
        response = await client.post("/api/v1/users/me/data-export", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["download_url"] == "https://storage.example/export.zip"
    mock_upload.assert_called_once()

    second = await client.post("/api/v1/users/me/data-export", headers=auth_headers)
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_totp_2fa_setup_enable_and_login_challenge(client, auth_headers, authenticated_user):
    from app.infrastructure import totp

    setup = await client.post(
        "/api/v1/users/me/2fa/setup", headers=auth_headers, json={"method": "totp"}
    )
    assert setup.status_code == 200
    secret = setup.json()["totp_secret"]
    assert secret

    code = totp._hotp(secret, int(__import__("time").time() // 30))
    enabled = await client.post(
        "/api/v1/users/me/2fa/enable",
        headers=auth_headers,
        json={"method": "totp", "code": code},
    )
    assert enabled.status_code == 200
    recovery_codes = enabled.json()["recovery_codes"]
    assert len(recovery_codes) == 10

    status_resp = await client.get("/api/v1/users/me/2fa", headers=auth_headers)
    assert status_resp.json() == {
        "enabled": True,
        "method": "totp",
        "recovery_email": None,
        "recovery_email_verified": False,
    }

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    assert login.status_code == 200
    assert login.json()["mfa_required"] is True
    challenge_token = login.json()["challenge_token"]
    assert login.json()["access_token"] is None

    bad_code = await client.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge_token, "code": "000000"},
    )
    assert bad_code.status_code == 400
    assert bad_code.json()["code"] == "AUTH_2FA_CODE_INVALID"

    fresh_code = totp._hotp(secret, int(__import__("time").time() // 30))
    verified = await client.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge_token, "code": fresh_code},
    )
    assert verified.status_code == 200
    assert verified.json()["access_token"]


@pytest.mark.asyncio
async def test_totp_recovery_code_completes_login(client, auth_headers, authenticated_user):
    from app.infrastructure import totp

    setup = await client.post(
        "/api/v1/users/me/2fa/setup", headers=auth_headers, json={"method": "totp"}
    )
    secret = setup.json()["totp_secret"]
    code = totp._hotp(secret, int(__import__("time").time() // 30))
    enabled = await client.post(
        "/api/v1/users/me/2fa/enable",
        headers=auth_headers,
        json={"method": "totp", "code": code},
    )
    recovery_code = enabled.json()["recovery_codes"][0]

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    challenge_token = login.json()["challenge_token"]

    verified = await client.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge_token, "recovery_code": recovery_code},
    )
    assert verified.status_code == 200

    # Recovery codes are one-time use.
    login2 = await client.post(
        "/api/v1/auth/login",
        json={"email": authenticated_user.email, "password": "Password1"},
    )
    reused = await client.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": login2.json()["challenge_token"], "recovery_code": recovery_code},
    )
    assert reused.status_code == 400


@pytest.mark.asyncio
async def test_disable_two_factor_requires_password(client, auth_headers):
    from app.infrastructure import totp

    setup = await client.post(
        "/api/v1/users/me/2fa/setup", headers=auth_headers, json={"method": "totp"}
    )
    secret = setup.json()["totp_secret"]
    code = totp._hotp(secret, int(__import__("time").time() // 30))
    await client.post(
        "/api/v1/users/me/2fa/enable",
        headers=auth_headers,
        json={"method": "totp", "code": code},
    )

    wrong = await client.post(
        "/api/v1/users/me/2fa/disable", headers=auth_headers, json={"password": "WrongPass1"}
    )
    assert wrong.status_code == 401

    ok = await client.post(
        "/api/v1/users/me/2fa/disable", headers=auth_headers, json={"password": "Password1"}
    )
    assert ok.status_code == 200

    status_resp = await client.get("/api/v1/users/me/2fa", headers=auth_headers)
    assert status_resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_admin_can_flag_internal_account(client, db, authenticated_user):
    import bcrypt

    from app.repositories import user_repo
    from app.utils.jwt import create_access_token

    admin = await user_repo.create_email_user(
        db,
        email="admin-internal@example.com",
        username="admininternal",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="User",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    admin_headers = {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}

    response = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/internal",
        headers=admin_headers,
        json={"is_internal": True},
    )
    assert response.status_code == 200

    detail = await client.get(
        f"/api/v1/admin/users/{authenticated_user.id}", headers=admin_headers
    )
    assert detail.json()["is_internal"] is True
