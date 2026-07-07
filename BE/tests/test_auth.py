"""
Auth integration tests — UC-AUTH-001 through UC-AUTH-005.
Runs against kusshoes_test DB with real Redis.
"""
import json
import uuid
from datetime import UTC

import pytest
import pytest_asyncio

# ── Helpers ───────────────────────────────────────────────────────────────────

REGISTER_URL = "/api/v1/auth/register"
VERIFY_URL = "/api/v1/auth/verify-otp"
RESEND_URL = "/api/v1/auth/resend-otp"
LOGIN_URL = "/api/v1/auth/login"
ADMIN_LOGIN_URL = "/api/v1/admin/auth/login"


async def _register(client, email="test@example.com", username="testuser1"):
    return await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "username": username,
            "password": "Password1",
            "confirm_password": "Password1",
            "full_name": "Test User",
        },
    )


async def _get_otp_from_redis(redis, user_id: str) -> str:
    from app.infrastructure.otp_store import otp_key
    raw = await redis.get(otp_key(user_id))
    assert raw is not None, "OTP not found in Redis"
    return json.loads(raw)["code"]


# ── UC-AUTH-001: Registration ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client, mock_send_otp_email):
    res = await _register(client)
    assert res.status_code == 201
    body = res.json()
    assert "user_id" in body
    assert body["email"] == "test@example.com"
    assert "message" in body
    mock_send_otp_email.assert_called_once()


@pytest.mark.asyncio
async def test_register_missing_field(client):
    res = await client.post(REGISTER_URL, json={"email": "x@x.com"})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email(client):
    res = await client.post(
        REGISTER_URL,
        json={
            "email": "not-an-email",
            "username": "testuser1",
            "password": "Password1",
            "confirm_password": "Password1",
            "full_name": "Test User",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_weak_password(client):
    res = await client.post(
        REGISTER_URL,
        json={
            "email": "test@example.com",
            "username": "testuser1",
            "password": "weak",
            "confirm_password": "weak",
            "full_name": "Test User",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_password_mismatch(client):
    res = await client.post(
        REGISTER_URL,
        json={
            "email": "test@example.com",
            "username": "testuser1",
            "password": "Password1",
            "confirm_password": "Password2",
            "full_name": "Test User",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    await _register(client)
    res = await _register(client)
    assert res.status_code == 409
    assert res.json()["code"] == "AUTH_EMAIL_TAKEN"


@pytest.mark.asyncio
async def test_register_duplicate_username(client):
    await _register(client, email="first@example.com")
    res = await _register(client, email="second@example.com")
    assert res.status_code == 409
    assert res.json()["code"] == "AUTH_USERNAME_TAKEN"


# ── UC-AUTH-002: OTP Verification ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_otp_success(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]
    otp = await _get_otp_from_redis(redis, user_id)

    res = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": otp})
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_verify_otp_expired(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    # Manually delete OTP to simulate expiry
    from app.infrastructure.otp_store import otp_key
    await redis.delete(otp_key(user_id))

    res = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": "123456"})
    assert res.status_code == 400
    assert res.json()["code"] == "OTP_EXPIRED"


@pytest.mark.asyncio
async def test_verify_otp_wrong_code_remaining(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    res = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": "000000"})
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "OTP_INVALID"
    assert "4 lần" in body["message"]


@pytest.mark.asyncio
async def test_verify_otp_lockout_after_5_failures(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    for _ in range(5):
        await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": "000000"})

    res = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": "000000"})
    assert res.status_code == 429
    assert res.json()["code"] == "OTP_LOCKED"


@pytest.mark.asyncio
async def test_verify_otp_when_locked(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    # Manually set lock
    from app.infrastructure.otp_store import lock_key
    await redis.set(lock_key(user_id), "1", ex=3600)

    res = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": "123456"})
    assert res.status_code == 429
    assert res.json()["code"] == "OTP_LOCKED"


@pytest.mark.asyncio
async def test_resend_otp_success(client, redis, mock_send_otp_email):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    # Set resend_at in the past to bypass cooldown
    from app.infrastructure.otp_store import otp_key
    raw = json.loads(await redis.get(otp_key(user_id)))
    raw["resend_at"] = "2000-01-01T00:00:00+00:00"
    await redis.set(otp_key(user_id), json.dumps(raw), ex=900)

    res = await client.post(RESEND_URL, json={"user_id": user_id})
    assert res.status_code == 200
    body = res.json()
    assert body["resend_remaining"] == 1
    assert mock_send_otp_email.call_count == 2  # once for register, once for resend


@pytest.mark.asyncio
async def test_resend_otp_limit(client, redis, mock_send_otp_email):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    # Set resend_count to 2
    from app.infrastructure.otp_store import otp_key
    raw = json.loads(await redis.get(otp_key(user_id)))
    raw["resend_count"] = 2
    raw["resend_at"] = "2000-01-01T00:00:00+00:00"
    await redis.set(otp_key(user_id), json.dumps(raw), ex=900)

    res = await client.post(RESEND_URL, json={"user_id": user_id})
    assert res.status_code == 429
    assert res.json()["code"] == "OTP_RESEND_LIMIT"


@pytest.mark.asyncio
async def test_resend_otp_cooldown(client, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]

    # resend_at = now (within cooldown)
    from datetime import datetime

    from app.infrastructure.otp_store import otp_key
    raw = json.loads(await redis.get(otp_key(user_id)))
    raw["resend_at"] = datetime.now(UTC).isoformat()
    await redis.set(otp_key(user_id), json.dumps(raw), ex=900)

    res = await client.post(RESEND_URL, json={"user_id": user_id})
    assert res.status_code == 429
    assert res.json()["code"] == "OTP_RESEND_COOLDOWN"


# ── UC-AUTH-003: Login email/password ─────────────────────────────────────────

@pytest_asyncio.fixture
async def verified_user(client, redis):
    """Register + verify OTP → returns (email, password, tokens)."""
    email = "verified@example.com"
    password = "Password1"
    reg = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "username": "verifieduser",
            "password": password,
            "confirm_password": password,
            "full_name": "Verified User",
        },
    )
    user_id = reg.json()["user_id"]
    otp = await _get_otp_from_redis(redis, user_id)
    tokens = await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": otp})
    return {"email": email, "password": password, "tokens": tokens.json(), "user_id": user_id}


@pytest.mark.asyncio
async def test_login_success(client, verified_user):
    res = await client.post(
        LOGIN_URL,
        json={"email": verified_user["email"], "password": verified_user["password"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body


@pytest.mark.asyncio
async def test_login_wrong_password(client, verified_user):
    res = await client.post(
        LOGIN_URL,
        json={"email": verified_user["email"], "password": "WrongPass1"},
    )
    assert res.status_code == 401
    assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    res = await client.post(
        LOGIN_URL,
        json={"email": "nobody@example.com", "password": "Password1"},
    )
    assert res.status_code == 401
    assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_unverified_user(client, redis):
    await _register(client)

    res = await client.post(LOGIN_URL, json={"email": "test@example.com", "password": "Password1"})
    assert res.status_code == 403
    body = res.json()
    assert body["code"] == "AUTH_EMAIL_NOT_VERIFIED"
    assert "user_id" in body


@pytest.mark.asyncio
async def test_login_google_only_account(client, db):
    """Google-only user (no password_hash) gets AUTH_GOOGLE_ONLY on password login."""
    from app.repositories import user_repo
    await user_repo.create_google_user(
        db,
        email="google@example.com",
        google_id="google123",
        first_name="Google",
        last_name="User",
        username="googleuser",
    )
    await db.commit()

    res = await client.post(LOGIN_URL, json={"email": "google@example.com", "password": "Password1"})
    assert res.status_code == 400
    assert res.json()["code"] == "AUTH_GOOGLE_ONLY"


@pytest.mark.asyncio
async def test_login_banned_account(client, db, redis):
    reg = await _register(client)
    user_id = reg.json()["user_id"]
    otp = await _get_otp_from_redis(redis, user_id)
    await client.post(VERIFY_URL, json={"user_id": user_id, "otp_code": otp})

    # Ban the user
    from app.repositories import user_repo
    user = await user_repo.get_by_email(db, "test@example.com")
    user.status = "suspended"
    await db.commit()

    res = await client.post(LOGIN_URL, json={"email": "test@example.com", "password": "Password1"})
    assert res.status_code == 403
    assert res.json()["code"] == "AUTH_ACCOUNT_BANNED"


# ── UC-AUTH-004: Google OAuth ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_callback_state_mismatch(client):
    res = await client.get("/api/v1/auth/google/callback?code=fake&state=invalid_state")
    assert res.status_code == 400
    assert res.json()["code"] == "AUTH_OAUTH_STATE_INVALID"


# ── UC-AUTH-005: Admin/Staff Login ────────────────────────────────────────────

@pytest_asyncio.fixture
async def admin_user(db):
    """Create an admin user directly in DB."""
    import bcrypt as _bcrypt
    from sqlalchemy import text
    password_hash = _bcrypt.hashpw(b"AdminPass1", _bcrypt.gensalt(rounds=4)).decode()

    await db.execute(
        text("""
            INSERT INTO users (id, account_code, email, password_hash, first_name, last_name,
                               username, status, is_verified, role,
                               language, preferred_styles, created_at, updated_at)
            VALUES (
                gen_random_uuid(),
                'KS-2026-99999',
                'admin@kusshoes.vn',
                :password_hash,
                'Admin', 'User',
                'adminuser', 'active', TRUE, 'admin',
                'vi', '{}', NOW(), NOW()
            )
        """),
        {"password_hash": password_hash},
    )
    await db.commit()
    return {"email": "admin@kusshoes.vn", "password": "AdminPass1", "role": "admin"}


@pytest_asyncio.fixture
async def staff_user(db):
    """Create a staff user directly in DB."""
    import bcrypt as _bcrypt
    from sqlalchemy import text
    password_hash = _bcrypt.hashpw(b"StaffPass1", _bcrypt.gensalt(rounds=4)).decode()

    await db.execute(
        text("""
            INSERT INTO users (id, account_code, email, password_hash, first_name, last_name,
                               username, status, is_verified, role,
                               language, preferred_styles, created_at, updated_at)
            VALUES (
                gen_random_uuid(),
                'KS-2026-99998',
                'staff@kusshoes.vn',
                :password_hash,
                'Staff', 'User',
                'staffuser', 'active', TRUE, 'staff',
                'vi', '{}', NOW(), NOW()
            )
        """),
        {"password_hash": password_hash},
    )
    await db.commit()
    return {"email": "staff@kusshoes.vn", "password": "StaffPass1", "role": "staff"}


@pytest.mark.asyncio
async def test_admin_login_success(client, admin_user):
    res = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": admin_user["email"], "password": admin_user["password"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body["role"] == "admin"


@pytest.mark.asyncio
async def test_staff_login_success(client, staff_user):
    res = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": staff_user["email"], "password": staff_user["password"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body["role"] == "staff"


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client, admin_user):
    res = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": admin_user["email"], "password": "WrongPass1"},
    )
    assert res.status_code == 401
    assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_regular_user_cannot_use_admin_endpoint(client, verified_user):
    """Regular user login through admin endpoint must fail."""
    res = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": verified_user["email"], "password": verified_user["password"]},
    )
    assert res.status_code == 401
    assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_admin_login_banned(client, db, admin_user):
    from app.repositories import user_repo
    user = await user_repo.get_admin_by_email(db, admin_user["email"])
    user.status = "suspended"
    await db.commit()

    res = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": admin_user["email"], "password": admin_user["password"]},
    )
    assert res.status_code == 403
    assert res.json()["code"] == "AUTH_ACCOUNT_BANNED"


@pytest.mark.asyncio
async def test_refresh_and_logout(client, verified_user):
    refresh_token = verified_user["tokens"]["refresh_token"]
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    assert "access_token" in refreshed.json()

    headers = {"Authorization": f"Bearer {verified_user['tokens']['access_token']}"}
    logged_out = await client.post(
        "/api/v1/auth/logout",
        headers=headers,
        json={"refresh_token": refresh_token},
    )
    assert logged_out.status_code == 200
    rejected = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert rejected.status_code == 401


@pytest.mark.asyncio
async def test_sso_token_is_one_time_use(client, verified_user, service_headers):
    headers = {"Authorization": f"Bearer {verified_user['tokens']['access_token']}"}
    project_id = str(uuid.uuid4())
    created = await client.post(
        "/api/v1/auth/sso-token",
        headers=headers,
        json={"project_id": project_id},
    )
    assert created.status_code == 200
    token = created.json()["sso_token"]
    verified = await client.post(
        "/api/v1/auth/verify-sso",
        headers=service_headers,
        json={"sso_token": token},
    )
    assert verified.status_code == 200
    assert verified.json()["project_id"] == project_id
    replay = await client.post(
        "/api/v1/auth/verify-sso",
        headers=service_headers,
        json={"sso_token": token},
    )
    assert replay.status_code == 401
