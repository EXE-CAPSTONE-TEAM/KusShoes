"""Activation codes (coupon discount_type='grant_plan'): a Free account redeems a code and
gets a COMP plan for N days, with no invoice and no payment gateway."""
import asyncio
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
import sqlalchemy as sa

from app.models.coupon import Coupon
from app.utils.jwt import create_access_token

GRANT_DAYS = 30  # value under test; any 1..GRANT_PLAN_MAX_DAYS exercises the same path
URL = "/api/v1/subscription/redeem-code"


async def _make_code(db, *, code="SHOWCASE", max_uses=10, days=GRANT_DAYS, **overrides):
    fields = {
        "code": code,
        "discount_type": "grant_plan",
        "value": days,
        "plan_tiers": ["basic"],
        "max_uses": max_uses,
        "is_active": True,
    }
    fields.update(overrides)
    coupon = Coupon(**fields)
    db.add(coupon)
    await db.commit()
    return coupon


async def _make_user(db, n: int):
    from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo

    user = await user_repo.create_email_user(
        db,
        email=f"guest{n}@example.com",
        username=f"guest{n}",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Guest",
        last_name=str(n),
    )
    user.is_verified = True
    plan = await plan_repo.get_free_plan(db)
    await subscription_repo.create_free(db, user_id=user.id, plan_id=plan.id)
    await monthly_usage_repo.create_for_user(db, user_id=user.id, period_start=datetime.now(UTC))
    await db.commit()
    return user


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), role='user')}"}


@pytest.mark.asyncio
async def test_free_user_redeems_code_and_gets_comp_basic(client, db, auth_headers, authenticated_user):
    from app.repositories import invoice_repo, subscription_repo

    await _make_code(db)
    before = datetime.now(UTC)
    response = await client.post(URL, headers=auth_headers, json={"code": "showcase"})  # case-insensitive
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tier"] == "basic_monthly"
    assert body["days"] == GRANT_DAYS

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "basic_monthly"
    assert subscription.status == "active"
    assert subscription.is_comp is True
    expected = before + timedelta(days=GRANT_DAYS)
    assert abs(subscription.expires_at - expected) < timedelta(minutes=1)
    assert await invoice_repo.list_by_user(db, authenticated_user.id, limit=1) == []

    coupon = (await db.execute(sa.select(Coupon))).scalar_one()
    await db.refresh(coupon)
    assert coupon.used_count == 1


@pytest.mark.asyncio
async def test_same_user_cannot_redeem_twice(client, db, auth_headers):
    await _make_code(db)
    assert (await client.post(URL, headers=auth_headers, json={"code": "SHOWCASE"})).status_code == 200
    again = await client.post(URL, headers=auth_headers, json={"code": "SHOWCASE"})
    assert again.status_code == 422
    assert again.json()["code"] == "COUPON_INVALID"


@pytest.mark.asyncio
async def test_paid_user_cannot_redeem(client, db, auth_headers, authenticated_user):
    from app.repositories import plan_repo, subscription_repo

    await _make_code(db)
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    await subscription_repo.upsert_after_payment(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        tier="basic_monthly",
        status="active",
        expires_at=datetime.now(UTC) + timedelta(days=10),
        current_period_start=datetime.now(UTC),
    )
    await db.commit()
    response = await client.post(URL, headers=auth_headers, json={"code": "SHOWCASE"})
    assert response.status_code == 409
    await db.refresh(subscription)
    assert subscription.is_comp is False  # untouched


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"is_active": False},
        {"valid_until": datetime.now(UTC) - timedelta(days=1)},
        {"valid_from": datetime.now(UTC) + timedelta(days=1)},
        {"max_uses": 1, "used_count": 1},
        {"discount_type": "percent", "value": 100, "plan_tiers": None},
    ],
    ids=["inactive", "expired", "not-yet-valid", "exhausted", "not-an-activation-code"],
)
async def test_unusable_codes_are_rejected(client, db, auth_headers, authenticated_user, overrides):
    from app.repositories import subscription_repo

    await _make_code(db, **overrides)
    response = await client.post(URL, headers=auth_headers, json={"code": "SHOWCASE"})
    assert response.status_code == 422
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "free"


@pytest.mark.asyncio
async def test_unknown_code_is_rejected(client, auth_headers):
    response = await client.post(URL, headers=auth_headers, json={"code": "NOPE-NOPE"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_activation_code_is_not_a_checkout_discount(client, db, auth_headers):
    """Without the guard, grant_plan would fall into the fixed_price branch of evaluate()
    and sell Basic for MIN_CHARGE_VND while burning a use."""
    await _make_code(db)
    quote = await client.post(
        "/api/v1/subscription/checkout/quote",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "SHOWCASE"},
    )
    assert quote.status_code == 422
    preview = await client.post(
        "/api/v1/subscription/coupon/preview",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "SHOWCASE"},
    )
    assert preview.status_code == 422


@pytest.mark.asyncio
async def test_redeem_is_rate_limited(client, db, auth_headers):
    from app.services.coupon_service import REDEEM_ATTEMPTS_PER_WINDOW

    statuses = [
        (await client.post(URL, headers=auth_headers, json={"code": f"GUESS-{i}"})).status_code
        for i in range(REDEEM_ATTEMPTS_PER_WINDOW + 1)
    ]
    assert statuses[:REDEEM_ATTEMPTS_PER_WINDOW] == [422] * REDEEM_ATTEMPTS_PER_WINDOW
    assert statuses[-1] == 429


@pytest.mark.asyncio
async def test_concurrent_redemptions_never_exceed_max_uses(db):
    """10 uses, 14 people at the same moment. Each call has its own session/transaction, so
    this only passes when the coupon row lock serialises them."""
    from app.repositories import subscription_repo, user_repo
    from app.services import coupon_service
    from tests.conftest import _TestSession

    uses = 10
    people = 14
    await _make_code(db, max_uses=uses)
    user_ids = [(await _make_user(db, n)).id for n in range(people)]

    async def attempt(user_id):
        async with _TestSession() as session:
            user = await user_repo.get_by_id(session, user_id)
            try:
                await coupon_service.redeem_plan_code(session, user, "SHOWCASE")
                return True
            except Exception:
                await session.rollback()
                return False

    results = await asyncio.gather(*(attempt(uid) for uid in user_ids))
    assert sum(results) == uses

    coupon = (await db.execute(sa.select(Coupon))).scalar_one()
    await db.refresh(coupon)
    assert coupon.used_count == uses
    granted = 0
    for uid in user_ids:
        subscription = await subscription_repo.get_by_user(db, uid)
        await db.refresh(subscription)
        granted += subscription.tier == "basic_monthly"
    assert granted == uses


@pytest.mark.asyncio
async def test_admin_cannot_create_unbounded_activation_code(client, db):
    from tests.test_finance import _admin

    _admin_user, headers = await _admin(db, "code-admin@example.com", "codeadmin")
    url = "/api/v1/admin/billing/coupons"
    base = {"code": "OPEN-ENDED", "discount_type": "grant_plan", "value": 30, "plan_tiers": ["basic"]}

    assert (await client.post(url, headers=headers, json=base)).status_code == 422  # no max_uses
    both_tiers = {**base, "max_uses": 10, "plan_tiers": ["basic", "pro"]}
    assert (await client.post(url, headers=headers, json=both_tiers)).status_code == 422
    too_long = {**base, "max_uses": 10, "value": 366}
    assert (await client.post(url, headers=headers, json=too_long)).status_code == 422

    ok = await client.post(url, headers=headers, json={**base, "max_uses": 10})
    assert ok.status_code == 201, ok.text


@pytest.mark.asyncio
async def test_admin_can_switch_activation_code_off_and_cannot_widen_it(client, db):
    from tests.test_finance import _admin

    _admin_user, headers = await _admin(db, "toggle-admin@example.com", "toggleadmin")
    coupon = await _make_code(db)
    url = f"/api/v1/admin/billing/coupons/{coupon.id}"

    off = await client.patch(url, headers=headers, json={"is_active": False})
    assert off.status_code == 200, off.text
    assert off.json()["is_active"] is False

    too_long = await client.patch(url, headers=headers, json={"value": 366})
    assert too_long.status_code == 422
    both_tiers = await client.patch(url, headers=headers, json={"plan_tiers": ["basic", "pro"]})
    assert both_tiers.status_code == 422
