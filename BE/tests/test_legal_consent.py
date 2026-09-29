"""Consent to the published Terms + Privacy Policy (BR-02 / BR-89, LEGAL_VERSION).

Consent is only recorded after an explicit tick: the sign-up box, `consent=true` when a Google
account is first used, or the one-time prompt for existing users.
"""
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.consent_record import ConsentRecord
from app.models.user import User
from app.policy import LEGAL_VERSION, REQUIRED_CONSENT_TYPES
from app.repositories import consent_repo

REGISTER_URL = "/api/v1/auth/register"


def _signup(**overrides):
    body = {
        "email": "consent@example.com",
        "username": "consentuser",
        "password": "Password1",
        "confirm_password": "Password1",
        "full_name": "Consent User",
        "age_confirmed": True,
    }
    body.update(overrides)
    return body


async def _legal_records(db, user_id) -> list[ConsentRecord]:
    rows = await db.execute(
        select(ConsentRecord).where(
            ConsentRecord.user_id == user_id, ConsentRecord.type.in_(REQUIRED_CONSENT_TYPES)
        )
    )
    return list(rows.scalars())


@pytest.mark.asyncio
async def test_sign_up_without_the_consent_tick_is_refused(client, db):
    res = await client.post(REGISTER_URL, json=_signup(age_confirmed=False))

    assert res.status_code == 422
    assert "18" in res.text
    found = await db.execute(select(User).where(User.email == "consent@example.com"))
    assert found.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_sign_up_records_consent_at_the_current_version_and_channel(client, db):
    res = await client.post(REGISTER_URL, json=_signup(client="mobile"))
    assert res.status_code == 201

    records = await _legal_records(db, res.json()["user_id"])
    assert sorted(r.type for r in records) == sorted(REQUIRED_CONSENT_TYPES)
    assert {r.doc_version for r in records} == {LEGAL_VERSION}
    assert {r.channel for r in records} == {"mobile"}


async def _google_round_trip(client, monkeypatch, *, consent: bool, email: str, sub: str):
    """Start a real web Google sign-in (state stored in Redis), stub only Google itself."""
    from app.infrastructure import google_oauth

    params = {"consent": "true"} if consent else {}
    start = await client.get("/api/v1/auth/google", params=params)
    assert start.status_code in (302, 307)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    async def fake_user_info(_code):
        return {"sub": sub, "email": email, "given_name": "Gia", "family_name": "Tran"}

    monkeypatch.setattr(google_oauth, "fetch_user_info", fake_user_info)
    return await client.get(f"/api/v1/auth/google/callback?code=c&state={state}")


@pytest.mark.asyncio
async def test_new_google_account_without_consent_is_refused_and_not_created(
    client, db, monkeypatch
):
    res = await _google_round_trip(
        client, monkeypatch, consent=False, email="g-new@example.com", sub="g-sub-1"
    )

    assert res.status_code == 303
    target, _, fragment = res.headers["location"].partition("#")
    assert target == f"{settings.PUBLIC_WEB_URL.rstrip('/')}/auth/google/callback"
    assert "error=AUTH_CONSENT_REQUIRED" in fragment
    assert "access_token" not in fragment
    found = await db.execute(select(User).where(User.email == "g-new@example.com"))
    assert found.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_new_google_account_with_consent_is_created_with_consent_records(
    client, db, monkeypatch
):
    res = await _google_round_trip(
        client, monkeypatch, consent=True, email="g-ok@example.com", sub="g-sub-2"
    )

    assert "access_token=" in res.headers["location"]
    user = (await db.execute(select(User).where(User.email == "g-ok@example.com"))).scalar_one()
    records = await _legal_records(db, user.id)
    assert sorted(r.type for r in records) == sorted(REQUIRED_CONSENT_TYPES)
    assert {r.doc_version for r in records} == {LEGAL_VERSION}


@pytest.mark.asyncio
async def test_existing_google_user_signs_in_without_the_consent_flag(client, db, monkeypatch):
    first = await _google_round_trip(
        client, monkeypatch, consent=True, email="g-back@example.com", sub="g-sub-3"
    )
    assert "access_token=" in first.headers["location"]

    again = await _google_round_trip(
        client, monkeypatch, consent=False, email="g-back@example.com", sub="g-sub-3"
    )
    assert "access_token=" in again.headers["location"]


@pytest.mark.asyncio
async def test_existing_user_is_asked_once_and_older_versions_are_superseded(
    client, db, authenticated_user, auth_headers
):
    for record in await _legal_records(db, authenticated_user.id):
        await db.delete(record)
    await consent_repo.create(
        db, user_id=authenticated_user.id, type="tos", doc_version="0.9", channel="web"
    )
    await db.commit()

    me = await client.get("/api/v1/users/me", headers=auth_headers)
    assert me.json()["legal_consent_required"] is True

    accepted = await client.post(
        "/api/v1/users/me/legal-consent", headers=auth_headers, json={"channel": "web"}
    )
    assert accepted.status_code == 200
    assert accepted.json()["legal_consent_required"] is False

    records = await _legal_records(db, authenticated_user.id)
    active = [r for r in records if r.revoked_at is None]
    assert sorted(r.type for r in active) == sorted(REQUIRED_CONSENT_TYPES)
    assert {r.doc_version for r in active} == {LEGAL_VERSION}
    assert [r.doc_version for r in records if r.revoked_at is not None] == ["0.9"]

    # Accepting again is a no-op, not a pile of duplicate records.
    await client.post("/api/v1/users/me/legal-consent", headers=auth_headers, json={})
    assert len(await _legal_records(db, authenticated_user.id)) == len(records)


@pytest.mark.asyncio
async def test_legacy_state_value_is_treated_as_no_consent_not_a_crash(
    client, db, redis, monkeypatch
):
    from app.infrastructure import google_oauth

    await redis.set("oauth:state:legacy-state", "1", ex=60)

    async def fake_user_info(_code):
        return {"sub": "g-sub-legacy", "email": "g-legacy@example.com", "given_name": "L"}

    monkeypatch.setattr(google_oauth, "fetch_user_info", fake_user_info)
    res = await client.get("/api/v1/auth/google/callback?code=c&state=legacy-state")

    assert res.status_code == 303
    assert "error=AUTH_CONSENT_REQUIRED" in res.headers["location"]
