"""Regression tests for the auth findings in issues #46 (Google auto-link takeover),
#47 (2FA brute force) and #48 (X-Forwarded-For spoofing / admin login lockout)."""
import time
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import bcrypt
import pytest
from sqlalchemy import select
from starlette.requests import Request

from app.config import settings
from app.models.user import User
from app.utils.http import get_client_ip

LOGIN_URL = "/api/v1/auth/login"
TWOFA_VERIFY_URL = "/api/v1/auth/2fa/verify"
ADMIN_LOGIN_URL = "/api/v1/admin/auth/login"


async def _email_user(db, *, email: str, username: str, verified: bool, role: str = "user"):
    from app.repositories import user_repo

    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Set",
        last_name="ByRegistrant",
        role=role,
    )
    user.is_verified = verified
    await db.commit()
    return user


async def _google_round_trip(client, monkeypatch, *, email, sub, consent=True, verified=True):
    from app.infrastructure import google_oauth

    start = await client.get("/api/v1/auth/google", params={"consent": "true"} if consent else {})
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    async def fake_user_info(_code):
        return {
            "sub": sub,
            "email": email,
            "email_verified": verified,
            "given_name": "Real",
            "family_name": "Owner",
        }

    monkeypatch.setattr(google_oauth, "fetch_user_info", fake_user_info)
    return await client.get(f"/api/v1/auth/google/callback?code=c&state={state}")


def _fragment(res) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(res.headers["location"].partition("#")[2]).items()}


# ── #46: Google sign-in must not adopt an unproven registrant's password ──────


@pytest.mark.asyncio
async def test_google_takes_over_unverified_account_and_drops_registrant_password(
    client, db, monkeypatch
):
    squatted = await _email_user(db, email="victim@example.com", username="squatter", verified=False)

    res = await _google_round_trip(client, monkeypatch, email="victim@example.com", sub="g-victim")

    fragment = _fragment(res)
    assert fragment.get("access_token")
    assert fragment["is_new_user"] == "true"
    assert fragment["linked"] == "false"
    await db.refresh(squatted)
    assert squatted.google_id == "g-victim"
    assert squatted.is_verified is True
    assert squatted.password_hash is None
    assert squatted.username != "squatter"
    assert (squatted.first_name, squatted.last_name) == ("Real", "Owner")

    # The password chosen at registration no longer opens the account.
    login = await client.post(
        LOGIN_URL, json={"email": "victim@example.com", "password": "Password1"}
    )
    assert login.status_code != 200
    assert login.json()["code"] == "AUTH_GOOGLE_ONLY"


@pytest.mark.asyncio
async def test_google_takeover_of_unverified_account_needs_consent_and_leaves_row_alone(
    client, db, monkeypatch
):
    squatted = await _email_user(db, email="victim2@example.com", username="squatter2", verified=False)

    res = await _google_round_trip(
        client, monkeypatch, email="victim2@example.com", sub="g-victim2", consent=False
    )

    assert "error=AUTH_CONSENT_REQUIRED" in res.headers["location"]
    await db.refresh(squatted)
    assert squatted.google_id is None
    assert squatted.is_verified is False


@pytest.mark.asyncio
async def test_google_links_verified_account_keeps_password_and_notifies(
    client, db, monkeypatch
):
    owner = await _email_user(db, email="owner@example.com", username="owner", verified=True)
    original_hash = owner.password_hash

    with patch("app.infrastructure.task_queue.enqueue_google_linked_email") as notify:
        res = await _google_round_trip(client, monkeypatch, email="owner@example.com", sub="g-owner")

    fragment = _fragment(res)
    assert fragment["linked"] == "true"
    assert fragment["is_new_user"] == "false"
    await db.refresh(owner)
    assert owner.google_id == "g-owner"
    assert owner.password_hash == original_hash
    notify.assert_called_once_with("owner@example.com")


@pytest.mark.asyncio
async def test_google_account_with_unverified_email_neither_links_nor_signs_up(
    client, db, monkeypatch
):
    owner = await _email_user(db, email="owner3@example.com", username="owner3", verified=True)

    linked = await _google_round_trip(
        client, monkeypatch, email="owner3@example.com", sub="g-x", verified=False
    )
    created = await _google_round_trip(
        client, monkeypatch, email="nobody@example.com", sub="g-y", verified=False
    )

    assert "error=AUTH_GOOGLE_NO_EMAIL" in linked.headers["location"]
    assert "error=AUTH_GOOGLE_NO_EMAIL" in created.headers["location"]
    await db.refresh(owner)
    assert owner.google_id is None
    found = await db.execute(select(User).where(User.email == "nobody@example.com"))
    assert found.scalar_one_or_none() is None


# ── #47: 2FA codes cannot be guessed without limit ────────────────────────────


async def _enable_totp(client, auth_headers) -> str:
    from app.infrastructure import totp

    setup = await client.post(
        "/api/v1/users/me/2fa/setup", headers=auth_headers, json={"method": "totp"}
    )
    secret = setup.json()["totp_secret"]
    enabled = await client.post(
        "/api/v1/users/me/2fa/enable",
        headers=auth_headers,
        json={"method": "totp", "code": totp._hotp(secret, int(time.time() // 30))},
    )
    assert enabled.status_code == 200
    return secret


def _wrong_totp(secret: str) -> str:
    from app.infrastructure import totp

    step = int(time.time() // 30)
    valid = {totp._hotp(secret, step + d) for d in (-1, 0, 1)}
    return next(c for c in ("000000", "111111", "222222", "333333") if c not in valid)


@pytest.mark.asyncio
async def test_two_factor_locks_after_five_wrong_codes_even_with_right_code_after(
    client, auth_headers, authenticated_user
):
    from app.infrastructure import totp

    secret = await _enable_totp(client, auth_headers)
    creds = {"email": authenticated_user.email, "password": "Password1"}
    challenge = (await client.post(LOGIN_URL, json=creds)).json()["challenge_token"]
    wrong = _wrong_totp(secret)

    for _ in range(4):
        res = await client.post(TWOFA_VERIFY_URL, json={"challenge_token": challenge, "code": wrong})
        assert res.json()["code"] == "AUTH_2FA_CODE_INVALID"
    fifth = await client.post(TWOFA_VERIFY_URL, json={"challenge_token": challenge, "code": wrong})
    assert fifth.status_code == 429
    assert fifth.json()["code"] == "AUTH_2FA_LOCKED"

    # The locked challenge is gone, and a fresh login cannot start a new round of guesses.
    right = totp._hotp(secret, int(time.time() // 30))
    burnt = await client.post(TWOFA_VERIFY_URL, json={"challenge_token": challenge, "code": right})
    assert burnt.json()["code"] == "AUTH_2FA_CHALLENGE_INVALID"
    relogin = await client.post(LOGIN_URL, json=creds)
    assert relogin.status_code == 429
    assert relogin.json()["code"] == "AUTH_2FA_LOCKED"


@pytest.mark.asyncio
async def test_two_factor_success_clears_earlier_failures(
    client, auth_headers, authenticated_user
):
    from app.infrastructure import totp

    secret = await _enable_totp(client, auth_headers)
    creds = {"email": authenticated_user.email, "password": "Password1"}
    wrong = _wrong_totp(secret)

    for _ in range(2):
        challenge = (await client.post(LOGIN_URL, json=creds)).json()["challenge_token"]
        for _ in range(4):
            await client.post(TWOFA_VERIFY_URL, json={"challenge_token": challenge, "code": wrong})
        ok = await client.post(
            TWOFA_VERIFY_URL,
            json={"challenge_token": challenge, "code": totp._hotp(secret, int(time.time() // 30))},
        )
        assert ok.status_code == 200


# ── #48: client-chosen X-Forwarded-For entries never pick the rate-limit bucket ──


def _request(xff: str | None, peer: str = "10.0.0.2") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


@pytest.mark.parametrize(
    ("xff", "hops", "expected"),
    [
        ("6.6.6.6, 203.0.113.9", 1, "203.0.113.9"),  # nginx appended the real peer
        ("203.0.113.9", 1, "203.0.113.9"),  # nginx overwrote the header
        ("1.1.1.1, 6.6.6.6, 203.0.113.9, 198.51.100.4", 2, "203.0.113.9"),
        ("6.6.6.6", 0, "10.0.0.2"),  # no proxy: the header is pure client input
        (None, 1, "10.0.0.2"),
    ],
)
def test_client_ip_only_trusts_proxy_appended_hops(monkeypatch, xff, hops, expected):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", hops)
    assert get_client_ip(_request(xff)) == expected


@pytest.mark.asyncio
async def test_admin_login_locks_account_regardless_of_spoofed_ip(client, db):
    await _email_user(db, email="admin@example.com", username="adminuser", verified=True, role="admin")

    with patch("app.infrastructure.task_queue.enqueue_account_locked_email") as notify:
        for i in range(5):
            res = await client.post(
                ADMIN_LOGIN_URL,
                json={"email": "admin@example.com", "password": "WrongPass1"},
                headers={"X-Forwarded-For": f"198.51.100.{i}"},
            )
            assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"
    notify.assert_called_once_with("admin@example.com")

    locked = await client.post(
        ADMIN_LOGIN_URL,
        json={"email": "admin@example.com", "password": "Password1"},
        headers={"X-Forwarded-For": "198.51.100.200"},
    )
    assert locked.status_code == 429
    assert locked.json()["code"] == "AUTH_ACCOUNT_LOCKED"
