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
async def test_payment_gateways_follow_momo_flag(client):
    with patch.object(settings, "MOMO_ENABLED", False):
        response = await client.get("/api/v1/subscription/gateways")
    assert response.status_code == 200
    assert response.json() == {"payos": True, "momo": False}

    with patch.object(settings, "MOMO_ENABLED", True):
        response = await client.get("/api/v1/subscription/gateways")
    assert response.json() == {"payos": True, "momo": True}


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
async def test_checkout_momo_coming_soon(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/checkout",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "gateway": "momo"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "SUB_GATEWAY_COMING_SOON"


@pytest.mark.asyncio
async def test_checkout_creates_pending_invoice_via_momo(
    client, db, auth_headers, authenticated_user
):
    with patch.object(settings, "MOMO_ENABLED", True), patch(
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

    with patch.object(settings, "MOMO_ENABLED", True):
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


@pytest.mark.asyncio
async def test_admin_invoice_detail_and_transfer(client, db, auth_headers, authenticated_user):
    admin = await _make_admin(db)
    admin_headers = {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}

    plan = await _make_basic_plan(db)
    from app.repositories import invoice_repo

    order_code = 777123
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=order_code,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    await db.commit()

    data = {
        "orderCode": order_code,
        "amount": plan.price_vnd,
        "description": "KusShoes basic monthly",
        "reference": "REF777888",
        "code": "00",
        "desc": "success",
        "accountNumber": "999888777",
        "transactionDateTime": "2026-10-05 10:15:30",
        "currency": "VND",
        "counterAccountName": "LE THI B",
        "counterAccountNumber": "0987654321",
        "counterAccountBankId": "970415",
        "counterAccountBankName": "VietinBank",
    }
    payload = {
        "code": "00",
        "desc": "success",
        "success": True,
        "data": data,
        "signature": _payos_signature(data),
    }

    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        resp_webhook = await client.post("/api/v1/webhooks/payos", json=payload)
    assert resp_webhook.status_code == 200

    # Non-admin forbidden
    resp_forbidden = await client.get(
        f"/api/v1/admin/billing/invoices/{invoice.id}", headers=auth_headers
    )
    assert resp_forbidden.status_code == 403

    # Admin detail endpoint
    resp_detail = await client.get(
        f"/api/v1/admin/billing/invoices/{invoice.id}", headers=admin_headers
    )
    assert resp_detail.status_code == 200
    inv_data = resp_detail.json()
    assert inv_data["id"] == str(invoice.id)
    assert inv_data["user_email"] == authenticated_user.email
    assert inv_data["transfer"] is not None
    assert inv_data["transfer"]["sender_name"] == "LE THI B"
    assert inv_data["transfer"]["sender_account_number"] == "0987654321"  # Unmasked for admin
    assert inv_data["transfer"]["sender_bank_id"] == "970415"
    assert inv_data["transfer"]["sender_bank_name"] == "VietinBank"
    assert "2026-10-05" in inv_data["transfer"]["transferred_at"]

    # Search filter q matches order_code, payment_reference, or counterAccountName
    q_order = await client.get(
        f"/api/v1/admin/billing/invoices?q={order_code}", headers=admin_headers
    )
    assert any(i["id"] == str(invoice.id) for i in q_order.json()["items"])

    q_ref = await client.get(
        "/api/v1/admin/billing/invoices?q=REF777888", headers=admin_headers
    )
    assert any(i["id"] == str(invoice.id) for i in q_ref.json()["items"])

    q_name = await client.get(
        "/api/v1/admin/billing/invoices?q=LE+THI", headers=admin_headers
    )
    assert any(i["id"] == str(invoice.id) for i in q_name.json()["items"])

    # Admin subscriptions lists last_invoice_id
    subs = await client.get("/api/v1/admin/billing/subscriptions", headers=admin_headers)
    assert subs.status_code == 200
    user_sub = next(s for s in subs.json()["items"] if s["user_id"] == str(authenticated_user.id))
    assert user_sub["last_invoice_id"] == str(invoice.id)


@pytest.mark.asyncio
async def test_customer_invoice_by_order_and_masking(client, db, auth_headers, authenticated_user):
    from app.repositories import invoice_repo, user_repo
    other_user = await user_repo.create_email_user(
        db,
        email="other@example.com",
        username="otheruser",
        password_hash="pwd",
        first_name="Other",
        last_name="User",
    )
    other_user.is_verified = True
    await db.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(str(other_user.id))}"}

    plan = await _make_basic_plan(db)
    order_code = 888123
    await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=order_code,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    await db.commit()

    data = {
        "orderCode": order_code,
        "amount": plan.price_vnd,
        "description": "KusShoes basic monthly",
        "reference": "REF888",
        "code": "00",
        "desc": "success",
        "transactionDateTime": "2026-10-05 11:00:00",
        "counterAccountName": "TRAN VAN C",
        "counterAccountNumber": "1234567890",
    }
    payload = {
        "code": "00",
        "desc": "success",
        "success": True,
        "data": data,
        "signature": _payos_signature(data),
    }

    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        await client.post("/api/v1/webhooks/payos", json=payload)

    # Owner accesses by-order
    resp = await client.get(
        f"/api/v1/subscription/invoices/by-order/{order_code}", headers=auth_headers
    )
    assert resp.status_code == 200
    data_out = resp.json()
    assert data_out["order_code"] == order_code
    assert data_out["transfer"]["sender_name"] == "TRAN VAN C"
    assert data_out["transfer"]["sender_account_number"] == "••••7890"  # Masked!
    assert "gateway_metadata" not in data_out
    assert data_out["subscription_period"] is not None
    assert data_out["subscription_period"]["start"] is not None
    assert data_out["subscription_period"]["end"] is not None

    # Another user gets 404
    resp_other = await client.get(
        f"/api/v1/subscription/invoices/by-order/{order_code}", headers=other_headers
    )
    assert resp_other.status_code == 404

    # Non-existent order gets 404
    resp_missing = await client.get(
        "/api/v1/subscription/invoices/by-order/99999999", headers=auth_headers
    )
    assert resp_missing.status_code == 404


@pytest.mark.asyncio
async def test_checkout_quote_and_credits_quote(client, db, auth_headers, authenticated_user):
    from app.models.coupon import Coupon
    from app.repositories import plan_repo, subscription_repo
    plan = await _make_basic_plan(db)

    # 1. Plain purchase quote
    resp = await client.post(
        "/api/v1/subscription/checkout/quote",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly"},
    )
    assert resp.status_code == 200
    quote = resp.json()
    assert quote["plan"]["tier"] == "basic"
    assert quote["listed_price_vnd"] == plan.price_vnd
    assert quote["amount_vnd"] == plan.price_vnd
    assert quote["discount_vnd"] == 0
    assert quote["discount_reason"] is None
    assert quote["is_upgrade"] is False
    assert quote["buyer"]["email"] == authenticated_user.email
    assert quote["vat"]["rate_percent"] == 8

    # 2. Coupon quote
    coupon = Coupon(code="QUOTE20", discount_type="percent", value=20, is_active=True)
    db.add(coupon)
    await db.commit()

    resp_coupon = await client.post(
        "/api/v1/subscription/checkout/quote",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "QUOTE20"},
    )
    assert resp_coupon.status_code == 200
    q_coupon = resp_coupon.json()
    assert q_coupon["discount_reason"] == "coupon"
    assert q_coupon["coupon_code"] == "QUOTE20"
    assert q_coupon["discount_vnd"] == plan.price_vnd * 20 // 100
    assert q_coupon["amount_vnd"] == plan.price_vnd - q_coupon["discount_vnd"]

    # 3. Midcycle upgrade quote
    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.plan = plan
    sub.plan_id = plan.id
    sub.tier = "basic_monthly"
    sub.status = "active"
    from datetime import UTC, datetime, timedelta
    now = datetime.now(UTC)
    sub.current_period_start = now - timedelta(days=10)
    sub.expires_at = now + timedelta(days=20)
    await db.commit()

    pro_plan = await plan_repo.get_by_tier_and_cycle(db, "pro", "monthly")
    resp_upgrade = await client.post(
        "/api/v1/subscription/checkout/quote",
        headers=auth_headers,
        json={"tier": "pro", "billing_cycle": "monthly"},
    )
    assert resp_upgrade.status_code == 200
    q_upgrade = resp_upgrade.json()
    assert q_upgrade["is_upgrade"] is True
    assert q_upgrade["discount_reason"] == "upgrade_proration"
    assert q_upgrade["amount_vnd"] < pro_plan.price_vnd
    assert q_upgrade["current_tier"] == "basic_monthly"

    # 4. Already active quote returns 409
    resp_active = await client.post(
        "/api/v1/subscription/checkout/quote",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly"},
    )
    assert resp_active.status_code == 409

    # 5. Credits quote
    credit_resp = await client.post(
        "/api/v1/subscription/credits/quote",
        headers=auth_headers,
        json={"quantity": 2},
    )
    assert credit_resp.status_code == 200
    cred = credit_resp.json()
    assert cred["quantity"] == 2
    assert cred["total_vnd"] == 2 * settings.CREDIT_PRICE_VND
    assert cred["can_purchase"] is True


@pytest.mark.asyncio
async def test_customer_invoice_exposes_bill_line_item_fields(
    client, db, auth_headers, authenticated_user
):
    """The bill page labels a Credit invoice by its Credit count and a plan invoice by
    its coupon/upgrade discount reason, so the customer view must carry those fields."""
    from app.models.scan_credit import CREDIT_BILLING_CYCLE, CREDIT_INVOICE_TIER
    from app.repositories import invoice_repo

    plan = await _make_basic_plan(db)
    plan_invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=999001,
        listed_price_vnd=plan.price_vnd,
        discount_vnd=1000,
        coupon_code="SAVE1K",
        amount_vnd=plan.price_vnd - 1000,
        payment_method="payos",
    )
    credit_invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=None,
        plan_tier=CREDIT_INVOICE_TIER,
        billing_cycle=CREDIT_BILLING_CYCLE,
        order_code=999002,
        listed_price_vnd=3 * settings.CREDIT_PRICE_VND,
        amount_vnd=3 * settings.CREDIT_PRICE_VND,
        payment_method="payos",
    )
    await db.commit()

    plan_view = (
        await client.get(f"/api/v1/subscription/invoices/{plan_invoice.id}", headers=auth_headers)
    ).json()
    assert plan_view["coupon_code"] == "SAVE1K"
    assert plan_view["is_upgrade"] is False
    assert plan_view["credit_quantity"] is None

    credit_view = (
        await client.get(f"/api/v1/subscription/invoices/{credit_invoice.id}", headers=auth_headers)
    ).json()
    assert credit_view["credit_quantity"] == 3
    assert credit_view["coupon_code"] is None
