import hashlib
import hmac
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest

from app.config import settings
from app.utils.jwt import create_access_token


async def _make_basic_plan(db):
    from app.repositories import plan_repo

    return await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")


async def _make_admin(db):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email="admin@example.com",
        username="adminuser",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="User",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    return admin


def _payos_signature(data: dict) -> str:
    raw = "&".join(f"{k}={data[k]}" for k in sorted(data.keys()))
    return hmac.new(settings.PAYOS_CHECKSUM_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def _momo_ipn_signature(data: dict) -> str:
    fields = [
        "accessKey", "amount", "extraData", "message", "orderId", "orderInfo",
        "orderType", "partnerCode", "payType", "requestId", "responseTime",
        "resultCode", "transId",
    ]
    payload = {**data, "accessKey": settings.MOMO_ACCESS_KEY}
    raw = "&".join(f"{f}={payload.get(f, '')}" for f in fields)
    return hmac.new(settings.MOMO_SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


@pytest.mark.asyncio
async def test_list_plans_public(client):
    response = await client.get("/api/v1/plans")
    assert response.status_code == 200
    tiers = {p["tier"] for p in response.json()}
    assert "free" in tiers
    assert "basic" in tiers


@pytest.mark.asyncio
async def test_get_subscription(client, auth_headers):
    response = await client.get("/api/v1/subscription", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["tier"] == "free"


@pytest.mark.asyncio
async def test_checkout_plan_not_found(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/checkout",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "quarterly", "gateway": "payos"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "SUB_PLAN_NOT_FOUND"


@pytest.mark.asyncio
async def test_checkout_free_plan_not_sellable(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/checkout",
        headers=auth_headers,
        json={"tier": "free", "billing_cycle": "monthly", "gateway": "payos"},
    )
    assert response.status_code == 404  # free plan has no monthly row -> not found first
    assert response.json()["code"] == "SUB_PLAN_NOT_FOUND"


@pytest.mark.asyncio
async def test_checkout_invalid_gateway_rejected(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/checkout",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "gateway": "vnpay"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_checkout_creates_pending_invoice_via_payos(
    client, db, auth_headers, authenticated_user
):
    with patch(
        "app.infrastructure.payos_client.create_payment_link",
        new=AsyncMock(return_value=("https://pay.payos.vn/web/abc", "link_123")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=auth_headers,
            json={"tier": "basic", "billing_cycle": "monthly", "gateway": "payos"},
        )
    assert response.status_code == 200
    assert response.json()["checkout_url"] == "https://pay.payos.vn/web/abc"

    from app.repositories import invoice_repo

    invoices = await invoice_repo.list_by_user(db, authenticated_user.id, limit=10)
    assert len(invoices) == 1
    assert invoices[0].status == "pending"
    assert invoices[0].payment_method == "payos"
    assert invoices[0].gateway_transaction_id == "link_123"
    assert invoices[0].order_code > 0


@pytest.mark.asyncio
async def test_checkout_creates_pending_invoice_via_momo(
    client, db, auth_headers, authenticated_user
):
    with patch(
        "app.infrastructure.momo_client.create_payment",
        new=AsyncMock(return_value=("https://payment.momo.vn/pay/xyz", "momo://deeplink")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=auth_headers,
            json={"tier": "basic", "billing_cycle": "monthly", "gateway": "momo"},
        )
    assert response.status_code == 200
    assert response.json()["checkout_url"] == "https://payment.momo.vn/pay/xyz"

    from app.repositories import invoice_repo

    invoices = await invoice_repo.list_by_user(db, authenticated_user.id, limit=10)
    assert invoices[0].payment_method == "momo"


@pytest.mark.asyncio
async def test_cancel_subscription_requires_paid_sub(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/cancel", headers=auth_headers, json={"immediate": False}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "SUB_NOT_FOUND"


@pytest.mark.asyncio
async def test_cancel_subscription_immediate_downgrades_now(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import subscription_repo

    plan = await _make_basic_plan(db)
    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.plan_id = plan.id
    sub.tier = "basic_monthly"
    sub.status = "active"
    await db.commit()

    response = await client.post(
        "/api/v1/subscription/cancel", headers=auth_headers, json={"immediate": True}
    )
    assert response.status_code == 200

    await db.refresh(sub)
    assert sub.tier == "free"


@pytest.mark.asyncio
async def test_cancel_subscription_deferred_sets_flag(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import subscription_repo

    plan = await _make_basic_plan(db)
    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.plan_id = plan.id
    sub.tier = "basic_monthly"
    sub.status = "active"
    await db.commit()

    response = await client.post(
        "/api/v1/subscription/cancel", headers=auth_headers, json={"immediate": False}
    )
    assert response.status_code == 200

    await db.refresh(sub)
    assert sub.tier == "basic_monthly"  # unchanged until expiry — no auto-renew, no gateway call
    assert sub.cancel_at_period_end is True


@pytest.mark.asyncio
async def test_payos_webhook_invalid_signature(client):
    response = await client.post(
        "/api/v1/webhooks/payos",
        json={"code": "00", "data": {"orderCode": 1}, "signature": "bad"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_payos_webhook_activates_subscription_idempotently(
    client, db, auth_headers, authenticated_user
):
    plan = await _make_basic_plan(db)
    from app.repositories import invoice_repo

    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=555555,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    await db.commit()

    data = {
        "orderCode": 555555,
        "amount": plan.price_vnd,
        "description": "KusShoes basic monthly",
        "reference": "FT123456",
        "code": "00",
        "desc": "success",
    }
    payload = {"code": "00", "desc": "success", "success": True, "data": data,
               "signature": _payos_signature(data)}

    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email") as mock_email:
        response1 = await client.post("/api/v1/webhooks/payos", json=payload)
        response2 = await client.post("/api/v1/webhooks/payos", json=payload)

    assert response1.status_code == 200
    assert response2.status_code == 200

    await db.refresh(invoice)
    assert invoice.status == "paid"
    assert invoice.payment_reference == "FT123456"
    assert mock_email.call_count == 1  # not double-fired on redelivery

    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert sub.tier == "basic_monthly"
    assert sub.status == "active"


@pytest.mark.asyncio
async def test_momo_ipn_invalid_signature(client):
    response = await client.post(
        "/api/v1/webhooks/momo", json={"orderId": "1", "resultCode": 0, "signature": "bad"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_momo_ipn_activates_subscription(client, db, auth_headers, authenticated_user):
    plan = await _make_basic_plan(db)
    from app.repositories import invoice_repo

    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=666666,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="momo",
    )
    await db.commit()

    data = {
        "orderId": "666666",
        "amount": plan.price_vnd,
        "extraData": "",
        "message": "Success",
        "orderInfo": "KusShoes basic monthly",
        "orderType": "momo_wallet",
        "partnerCode": settings.MOMO_PARTNER_CODE,
        "payType": "qr",
        "requestId": "req-1",
        "responseTime": 1234567890,
        "resultCode": 0,
        "transId": "MOMO123",
    }
    payload = {**data, "signature": _momo_ipn_signature(data)}

    response = await client.post("/api/v1/webhooks/momo", json=payload)
    assert response.status_code == 200

    await db.refresh(invoice)
    assert invoice.status == "paid"
    assert invoice.payment_reference == "MOMO123"


@pytest.mark.asyncio
async def test_admin_billing_requires_admin(client, auth_headers):
    response = await client.get("/api/v1/admin/billing/subscriptions", headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_billing_list_and_force_downgrade(client, db, authenticated_user):
    admin = await _make_admin(db)
    admin_headers = {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}

    subs = await client.get("/api/v1/admin/billing/subscriptions", headers=admin_headers)
    assert subs.status_code == 200

    invoices = await client.get("/api/v1/admin/billing/invoices", headers=admin_headers)
    assert invoices.status_code == 200

    force = await client.post(
        f"/api/v1/admin/billing/subscriptions/{authenticated_user.id}/force-downgrade",
        headers=admin_headers,
    )
    assert force.status_code == 200

    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert sub.tier == "free"
