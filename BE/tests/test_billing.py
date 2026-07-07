from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest

from app.infrastructure.polar_client import WebhookVerificationError
from app.utils.jwt import create_access_token


async def _make_creator_plan(db):
    from app.repositories import plan_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "creator", "monthly")
    plan.polar_product_id = "prod_creator_monthly"
    await db.commit()
    return plan


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


@pytest.mark.asyncio
async def test_list_plans_public(client):
    response = await client.get("/api/v1/plans")
    assert response.status_code == 200
    tiers = {p["tier"] for p in response.json()}
    assert "free" in tiers


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
        json={"tier": "creator", "billing_cycle": "quarterly"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "SUB_PLAN_NOT_FOUND"


@pytest.mark.asyncio
async def test_checkout_plan_not_mapped_to_polar(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/checkout",
        headers=auth_headers,
        json={"tier": "creator", "billing_cycle": "monthly"},
    )
    assert response.status_code == 502
    assert response.json()["code"] == "SUB_PLAN_GATEWAY_UNAVAILABLE"


@pytest.mark.asyncio
async def test_checkout_creates_pending_invoice(client, db, auth_headers, authenticated_user):
    await _make_creator_plan(db)
    with patch(
        "app.infrastructure.polar_client.create_checkout",
        new=AsyncMock(return_value=("checkout_123", "https://polar.sh/checkout/123")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=auth_headers,
            json={"tier": "creator", "billing_cycle": "monthly"},
        )
    assert response.status_code == 200
    assert response.json()["checkout_url"] == "https://polar.sh/checkout/123"

    from app.repositories import invoice_repo

    invoices = await invoice_repo.list_by_user(db, authenticated_user.id, limit=10)
    assert len(invoices) == 1
    assert invoices[0].status == "pending"
    assert invoices[0].payment_method == "polar"
    assert invoices[0].gateway_transaction_id == "checkout_123"


@pytest.mark.asyncio
async def test_portal_link_requires_polar_customer(client, auth_headers):
    response = await client.post("/api/v1/subscription/portal", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "SUB_NO_POLAR_CUSTOMER"


@pytest.mark.asyncio
async def test_portal_link_returns_url(client, db, auth_headers, authenticated_user):
    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.polar_customer_id = "cus_123"
    await db.commit()

    with patch(
        "app.infrastructure.polar_client.create_customer_portal_session",
        new=AsyncMock(return_value="https://polar.sh/portal/abc"),
    ):
        response = await client.post("/api/v1/subscription/portal", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["portal_url"] == "https://polar.sh/portal/abc"


@pytest.mark.asyncio
async def test_cancel_subscription_requires_active_polar_sub(client, auth_headers):
    response = await client.post(
        "/api/v1/subscription/cancel", headers=auth_headers, json={"immediate": False}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "SUB_NOT_FOUND"


@pytest.mark.asyncio
async def test_cancel_subscription_calls_polar(client, db, auth_headers, authenticated_user):
    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.polar_subscription_id = "sub_123"
    await db.commit()

    with patch(
        "app.infrastructure.polar_client.cancel_subscription", new=AsyncMock()
    ) as mock_cancel:
        response = await client.post(
            "/api/v1/subscription/cancel", headers=auth_headers, json={"immediate": False}
        )
    assert response.status_code == 200
    mock_cancel.assert_awaited_once_with("sub_123", immediate=False)

    # DB state is untouched until the webhook arrives
    await db.refresh(sub)
    assert sub.status == "active"


@pytest.mark.asyncio
async def test_change_plan_calls_polar(client, db, auth_headers, authenticated_user):
    plan = await _make_creator_plan(db)
    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub.polar_subscription_id = "sub_123"
    await db.commit()

    with patch(
        "app.infrastructure.polar_client.update_subscription_product", new=AsyncMock()
    ) as mock_update:
        response = await client.post(
            "/api/v1/subscription/change-plan",
            headers=auth_headers,
            json={"tier": "creator", "billing_cycle": "monthly"},
        )
    assert response.status_code == 200
    mock_update.assert_awaited_once_with("sub_123", plan.polar_product_id)


@pytest.mark.asyncio
async def test_webhook_invalid_signature(client):
    with patch(
        "app.infrastructure.polar_client.verify_webhook_event",
        side_effect=WebhookVerificationError("bad signature"),
    ):
        response = await client.post("/api/v1/webhooks/polar", content=b"{}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_webhook_order_paid_idempotent(client, db, auth_headers, authenticated_user):
    plan = await _make_creator_plan(db)
    from app.repositories import invoice_repo

    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
        payment_method="polar",
        gateway_transaction_id="checkout_123",
    )
    await db.commit()

    fake_event = type(
        "Event",
        (),
        {
            "type": "order.paid",
            "data": type(
                "Data",
                (),
                {
                    "id": "order_123",
                    "metadata": {"invoice_id": str(invoice.id)},
                    "subscription": type("Sub", (), {"id": "sub_123"})(),
                    "subscription_id": "sub_123",
                    "customer": type(
                        "Customer", (), {"id": "cus_123", "external_id": str(authenticated_user.id)}
                    )(),
                },
            )(),
        },
    )()

    with patch(
        "app.infrastructure.polar_client.verify_webhook_event", return_value=fake_event
    ), patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email") as mock_email:
        response1 = await client.post("/api/v1/webhooks/polar", content=b"{}")
        response2 = await client.post("/api/v1/webhooks/polar", content=b"{}")

    assert response1.status_code == 200
    assert response2.status_code == 200

    await db.refresh(invoice)
    assert invoice.status == "paid"
    assert mock_email.call_count == 1  # not double-fired on redelivery

    from app.repositories import subscription_repo

    sub = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert sub.tier == "creator_monthly"
    assert sub.status == "active"


@pytest.mark.asyncio
async def test_webhook_refund_marks_invoice_refunded_without_touching_subscription(
    client, db, auth_headers, authenticated_user
):
    plan = await _make_creator_plan(db)
    from app.repositories import invoice_repo, subscription_repo

    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
        payment_method="polar",
        gateway_transaction_id="order_999",
    )
    await invoice_repo.mark_paid(
        db, invoice, paid_at=datetime.now(UTC), gateway_metadata_patch={}
    )
    sub_before = await subscription_repo.get_by_user(db, authenticated_user.id)
    sub_before.status = "active"
    sub_before.tier = "creator_monthly"
    await db.commit()

    fake_event = type(
        "Event",
        (),
        {
            "type": "order.refunded",
            "data": type("Data", (), {"id": "order_999", "order_id": "order_999", "metadata": {}})(),
        },
    )()

    with patch("app.infrastructure.polar_client.verify_webhook_event", return_value=fake_event):
        response = await client.post("/api/v1/webhooks/polar", content=b"{}")
    assert response.status_code == 200

    await db.refresh(invoice)
    assert invoice.status == "refunded"

    sub_after = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert sub_after.tier == "creator_monthly"
    assert sub_after.status == "active"


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
