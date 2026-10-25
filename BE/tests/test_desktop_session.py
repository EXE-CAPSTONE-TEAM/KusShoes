"""KusStudio Desktop sessions: refresh tokens in response bodies only for a verified desktop client.

The desktop webview (origin http://tauri.localhost) cannot use the SameSite refresh cookie, so it
gets the refresh token in the body instead — but only when the browser-set Origin is the Tauri
webview *and* it sends `X-KusShoes-Client: desktop`. Web scripts cannot forge Origin.
"""

import base64
import hashlib
import secrets
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.services import auth_service

LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
DESKTOP = {"Origin": "http://tauri.localhost", "X-KusShoes-Client": "desktop"}
CREDENTIALS = {"email": "profile@example.com", "password": "Password1"}


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)[:64]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


@pytest.mark.asyncio
async def test_desktop_login_returns_refresh_token_and_refresh_rotates_it(client, authenticated_user):
    login = await client.post(LOGIN_URL, json=CREDENTIALS, headers=DESKTOP)
    assert login.status_code == 200
    first = login.json()["refresh_token"]
    assert first

    client.cookies.clear()  # the desktop never relies on the cookie
    refreshed = await client.post(REFRESH_URL, json={"refresh_token": first}, headers=DESKTOP)
    assert refreshed.status_code == 200
    body = refreshed.json()
    assert body["access_token"]
    assert body["refresh_token"] and body["refresh_token"] != first

    client.cookies.clear()
    replay = await client.post(REFRESH_URL, json={"refresh_token": first}, headers=DESKTOP)
    assert replay.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers",
    [
        # XSS on the web app: it can add the header, but the browser sets the web Origin.
        {"Origin": settings.PUBLIC_WEB_URL.rstrip("/"), "X-KusShoes-Client": "desktop"},
        # The Tauri origin without the explicit opt-in.
        {"Origin": "http://tauri.localhost"},
        # No Origin at all.
        {"X-KusShoes-Client": "desktop"},
    ],
)
async def test_refresh_token_never_in_body_for_non_desktop_requests(client, authenticated_user, headers):
    login = await client.post(LOGIN_URL, json=CREDENTIALS, headers=headers)
    assert login.status_code == 200
    assert "refresh_token" not in login.json()
    assert "kusshoes_refresh_token=" in login.headers.get("set-cookie", "")

    refreshed = await client.post(REFRESH_URL, headers=headers)
    assert refreshed.status_code == 200
    assert "refresh_token" not in refreshed.json()


async def _claimed_launch(client, redis, user, monkeypatch) -> tuple[str, str]:
    project_id = "22222222-2222-4222-8222-222222222222"
    monkeypatch.setattr(
        auth_service.project_repo,
        "get_owned_by_id",
        AsyncMock(return_value=SimpleNamespace(id=project_id)),
    )
    ticket = await auth_service._store_opaque_record(
        redis,
        prefix="editor-launch-ticket",
        payload={"user_id": str(user.id), "project_id": project_id},
        ttl=60,
    )
    verifier, challenge = _pkce_pair()
    claim = await client.post(
        "/api/v1/auth/editor/launch/claim",
        json={"launch_ticket": ticket, "code_challenge": challenge, "code_challenge_method": "S256"},
    )
    assert claim.status_code == 200, claim.text
    return claim.json()["authorization_code"], verifier


@pytest.mark.asyncio
async def test_desktop_editor_launch_can_also_sign_the_app_in(client, redis, authenticated_user, monkeypatch):
    code, verifier = await _claimed_launch(client, redis, authenticated_user, monkeypatch)
    exchange = await client.post(
        "/api/v1/auth/editor/launch/exchange",
        json={"authorization_code": code, "code_verifier": verifier, "include_user_session": True},
        headers=DESKTOP,
    )
    assert exchange.status_code == 200, exchange.text
    body = exchange.json()
    assert body["access_token"]  # editor-session token, as before
    assert body["user_access_token"] and body["user_access_token"] != body["access_token"]

    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['user_access_token']}"})
    assert me.status_code == 200

    client.cookies.clear()
    refreshed = await client.post(REFRESH_URL, json={"refresh_token": body["refresh_token"]}, headers=DESKTOP)
    assert refreshed.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers, include",
    [
        (DESKTOP, False),  # desktop that did not ask (already signed in)
        ({"Origin": settings.PUBLIC_WEB_URL.rstrip("/"), "X-KusShoes-Client": "desktop"}, True),
    ],
)
async def test_editor_launch_without_a_verified_request_issues_no_user_session(
    client, redis, authenticated_user, monkeypatch, headers, include
):
    code, verifier = await _claimed_launch(client, redis, authenticated_user, monkeypatch)
    exchange = await client.post(
        "/api/v1/auth/editor/launch/exchange",
        json={"authorization_code": code, "code_verifier": verifier, "include_user_session": include},
        headers=headers,
    )
    assert exchange.status_code == 200, exchange.text
    body = exchange.json()
    assert body["access_token"]
    assert "user_access_token" not in body
    assert "refresh_token" not in body


@pytest.mark.asyncio
@pytest.mark.parametrize("desktop, expected", [(True, "ref-desktop"), (False, None)])
async def test_google_desktop_exchange_returns_refresh_token_only_to_desktop(client, monkeypatch, desktop, expected):
    async def fake_exchange(_redis, **_kwargs):
        return auth_service.IssuedTokens(access_token="acc.desktop", refresh_token="ref-desktop")

    monkeypatch.setattr(auth_service, "exchange_desktop_google_code", fake_exchange)
    res = await client.post(
        "/api/v1/auth/google/desktop/exchange",
        json={"code": "c" * 40, "code_verifier": "v" * 43},
        headers=DESKTOP if desktop else {},
    )
    assert res.status_code == 200, res.text
    assert res.json().get("refresh_token") == expected
