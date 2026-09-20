import bcrypt
import pytest

from app.utils.jwt import create_access_token, decode_access_token


async def _admin(db, *, two_factor: bool, email="imp-admin@example.com", username="impadmin"):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="Imp",
    )
    admin.is_verified = True
    admin.role = "admin"
    admin.two_factor_enabled = two_factor
    await db.commit()
    return admin, {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}


@pytest.mark.asyncio
async def test_impersonation_requires_admin_2fa_and_reason(client, db, authenticated_user):
    _, headers = await _admin(db, two_factor=False)
    denied = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/impersonate",
        headers=headers,
        json={"reason": "TICKET-42 hỗ trợ"},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "IMPERSONATION_REQUIRES_2FA"

    _, headers_2fa = await _admin(
        db, two_factor=True, email="imp-admin2@example.com", username="impadmin2"
    )
    no_reason = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/impersonate",
        headers=headers_2fa,
        json={"reason": "x"},
    )
    assert no_reason.status_code == 422


@pytest.mark.asyncio
async def test_impersonation_session_limits_and_end_notice(
    client, db, authenticated_user, mock_send_impersonation_notice
):
    from sqlalchemy import text

    admin, headers = await _admin(db, two_factor=True)
    started = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/impersonate",
        headers=headers,
        json={"reason": "TICKET-42 hỗ trợ"},
    )
    assert started.status_code == 200, started.text
    body = started.json()
    payload = decode_access_token(body["access_token"])
    assert payload["imp"] == str(admin.id)
    assert (payload["exp"] - payload["iat"]) == 30 * 60
    imp_headers = {"Authorization": f"Bearer {body['access_token']}"}

    # Normal reads work as the customer.
    assert (await client.get("/api/v1/users/me", headers=imp_headers)).status_code == 200

    # BR-80: blocked actions.
    for method, url, payload_json in (
        ("PUT", "/api/v1/users/me/password", {"current_password": "Password1", "new_password": "Password2", "confirm_password": "Password2"}),
        ("DELETE", "/api/v1/users/me", {"password": "Password1"}),
        ("GET", "/api/v1/users/me/2fa", None),
        ("POST", "/api/v1/subscription/checkout", {"tier": "basic", "billing_cycle": "monthly", "gateway": "payos"}),
    ):
        response = await client.request(method, url, headers=imp_headers, json=payload_json)
        assert response.status_code == 403, (url, response.text)
        assert response.json()["code"] == "IMPERSONATION_RESTRICTED"

    ended = await client.post("/api/v1/users/me/impersonation/end", headers=imp_headers)
    assert ended.status_code == 200
    mock_send_impersonation_notice.assert_called_once()
    assert mock_send_impersonation_notice.call_args.args[0] == authenticated_user.email

    actions = (await db.execute(text("SELECT action FROM audit_logs"))).scalars().all()
    assert {"impersonation.start", "impersonation.end"} <= set(actions)


@pytest.mark.asyncio
async def test_end_impersonation_requires_impersonation_token(client, auth_headers):
    response = await client.post("/api/v1/users/me/impersonation/end", headers=auth_headers)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_cannot_impersonate_staff_or_suspended(client, db, authenticated_user):
    _, headers = await _admin(db, two_factor=True)
    authenticated_user.status = "suspended"
    await db.commit()
    response = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/impersonate",
        headers=headers,
        json={"reason": "TICKET-43 hỗ trợ"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "IMPERSONATION_TARGET_INVALID"


@pytest.mark.asyncio
async def test_admin_reset_password_emails_customer_code(
    client, db, authenticated_user, mock_send_password_reset_email
):
    _, headers = await _admin(db, two_factor=False)
    response = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/reset-password", headers=headers
    )
    assert response.status_code == 200
    mock_send_password_reset_email.assert_called_once()
    assert mock_send_password_reset_email.call_args.args[0] == authenticated_user.email

    authenticated_user.password_hash = None
    await db.commit()
    google_only = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/reset-password", headers=headers
    )
    assert google_only.status_code == 400
