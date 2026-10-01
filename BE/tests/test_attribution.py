import json
import uuid

import pytest
from sqlalchemy import select

from app.infrastructure import google_oauth
from app.models.user import User
from app.models.user_attribution import UserAttribution
from app.services import auth_service

REGISTER_URL = "/api/v1/auth/register"


@pytest.mark.asyncio
async def test_register_saves_full_attribution(client, db, mock_send_otp_email):
    email = "attr_test_user@example.com"
    username = "attr_user_1"
    payload = {
        "email": email,
        "username": username,
        "password": "Password1",
        "confirm_password": "Password1",
        "full_name": "Attribution Tester",
        "age_confirmed": True,
        "attribution": {
            "utm_source": "facebook",
            "utm_medium": "cpc",
            "utm_campaign": "summer_promo_2026",
            "utm_term": "running shoes",
            "utm_content": "banner_ad_v2",
            "fbclid": "fb_click_id_999",
            "ttclid": "tt_click_id_888",
            "gclid": "gclid_777",
            "initial_referrer": "https://m.facebook.com/",
            "landing_page": "/pricing?utm_source=facebook&utm_medium=cpc",
        },
    }

    res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 201
    user_id = uuid.UUID(res.json()["user_id"])

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one()
    assert user.utm_source == "facebook"
    assert user.utm_campaign == "summer_promo_2026"
    assert user.acquisition_channel == "facebook"

    attr_result = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user_id))
    attr = attr_result.scalar_one_or_none()
    assert attr is not None
    assert attr.utm_source == "facebook"
    assert attr.utm_medium == "cpc"
    assert attr.utm_campaign == "summer_promo_2026"
    assert attr.utm_term == "running shoes"
    assert attr.utm_content == "banner_ad_v2"
    assert attr.fbclid == "fb_click_id_999"
    assert attr.ttclid == "tt_click_id_888"
    assert attr.gclid == "gclid_777"
    assert attr.initial_referrer == "https://m.facebook.com/"
    assert attr.landing_page == "/pricing?utm_source=facebook&utm_medium=cpc"
    assert attr.created_at is not None
    assert attr.updated_at is not None


@pytest.mark.asyncio
async def test_register_saves_legacy_utm_attribution(client, db, mock_send_otp_email):
    email = "legacy_utm@example.com"
    username = "legacy_user"
    payload = {
        "email": email,
        "username": username,
        "password": "Password1",
        "confirm_password": "Password1",
        "full_name": "Legacy UTM Tester",
        "age_confirmed": True,
        "utm_source": "tiktok",
        "utm_campaign": "spring_challenge",
    }

    res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 201
    user_id = uuid.UUID(res.json()["user_id"])

    attr_result = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user_id))
    attr = attr_result.scalar_one_or_none()
    assert attr is not None
    assert attr.utm_source == "tiktok"
    assert attr.utm_campaign == "spring_challenge"


@pytest.mark.asyncio
async def test_register_without_attribution_succeeds(client, db, mock_send_otp_email):
    email = "no_attr@example.com"
    username = "no_attr_user"
    payload = {
        "email": email,
        "username": username,
        "password": "Password1",
        "confirm_password": "Password1",
        "full_name": "No Attr Tester",
        "age_confirmed": True,
    }

    res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 201
    user_id = uuid.UUID(res.json()["user_id"])

    attr_result = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user_id))
    attr = attr_result.scalar_one_or_none()
    assert attr is None


@pytest.mark.asyncio
async def test_google_registration_persists_attribution(client, db, redis, monkeypatch):
    test_google_id = "google_sub_12345"
    test_email = "new_google_user@example.com"

    async def fake_user_info(_code):
        return {
            "sub": test_google_id,
            "email": test_email,
            "given_name": "Google",
            "family_name": "Attribution",
            "email_verified": True,
        }

    monkeypatch.setattr(google_oauth, "fetch_user_info", fake_user_info)

    attr_data = {
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "search_brand",
        "gclid": "gclid_test_999",
        "initial_referrer": "https://www.google.com/",
        "landing_page": "/?utm_source=google",
    }

    # Start Google OAuth with consent and attribution
    start_url = await auth_service.get_google_auth_url(
        redis,
        consent=True,
        attribution=json.dumps(attr_data),
    )
    from urllib.parse import parse_qs, urlparse
    parsed_start = urlparse(start_url)
    state = parse_qs(parsed_start.query)["state"][0]

    # Callback consumes state and creates user
    result = await auth_service.handle_google_callback(
        db,
        redis,
        code="valid_code",
        state=state,
    )
    assert result["is_new_user"] is True

    user_result = await db.execute(select(User).where(User.email == test_email))
    user = user_result.scalar_one()

    attr_result = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user.id))
    attr = attr_result.scalar_one_or_none()
    assert attr is not None
    assert attr.utm_source == "google"
    assert attr.utm_medium == "cpc"
    assert attr.utm_campaign == "search_brand"
    assert attr.gclid == "gclid_test_999"
    assert attr.landing_page == "/?utm_source=google"


@pytest.mark.asyncio
async def test_attribution_cascade_delete_with_user(client, db, mock_send_otp_email):
    email = "delete_test@example.com"
    username = "delete_user"
    payload = {
        "email": email,
        "username": username,
        "password": "Password1",
        "confirm_password": "Password1",
        "full_name": "Delete Tester",
        "age_confirmed": True,
        "attribution": {
            "utm_source": "zalo",
            "utm_medium": "referral",
        },
    }

    res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 201
    user_id = uuid.UUID(res.json()["user_id"])

    attr_result = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user_id))
    assert attr_result.scalar_one_or_none() is not None

    from sqlalchemy import text
    await db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    await db.commit()

    attr_after = await db.execute(select(UserAttribution).where(UserAttribution.user_id == user_id))
    assert attr_after.scalar_one_or_none() is None
