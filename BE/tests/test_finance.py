import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest

from app.config import settings
from app.utils.jwt import create_access_token


async def _admin(db, email, username):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="User",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}
    return admin, headers


def _payos_signature(data: dict) -> str:
    raw = "&".join(f"{k}={data[k]}" for k in sorted(data.keys()))
    return hmac.new(settings.PAYOS_CHECKSUM_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


async def _pay(client, db, headers, user, *, tier="basic", coupon_code=None):
    """Checkout via PayOS then deliver the signed webhook. Returns the invoice."""
    from app.repositories import invoice_repo

    with patch(
        "app.infrastructure.payos_client.create_payment_link",
        new=AsyncMock(return_value=("https://pay.payos.vn/x", "link_x")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=headers,
            json={
                "tier": tier,
                "billing_cycle": "monthly",
                "gateway": "payos",
                "coupon_code": coupon_code,
            },
        )
    assert response.status_code == 200, response.text
    invoice = (await invoice_repo.list_by_user(db, user.id, limit=1))[0]
    data = {
        "orderCode": invoice.order_code,
        "amount": invoice.amount_vnd,
        "reference": f"FT{invoice.order_code}",
        "code": "00",
        "desc": "success",
    }
    payload = {"code": "00", "success": True, "data": data, "signature": _payos_signature(data)}
    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        hook = await client.post("/api/v1/webhooks/payos", json=payload)
    assert hook.status_code == 200
    await db.refresh(invoice)
    return invoice


@pytest.mark.asyncio
async def test_payment_issues_receipt_and_download_url(
    client, db, auth_headers, authenticated_user
):
    invoice = await _pay(client, db, auth_headers, authenticated_user)
    assert invoice.status == "paid"
    assert invoice.receipt_number.startswith("KUS-")
    assert invoice.receipt_snapshot["amount"] == invoice.amount_vnd
    # BR-31: the customer's real email/name never appear on the receipt.
    assert "profile@example.com" not in str(invoice.receipt_snapshot)

    with patch(
        "app.infrastructure.storage.generate_presigned_download_url",
        return_value="https://storage.example/receipt.pdf",
    ):
        response = await client.get(
            f"/api/v1/subscription/invoices/{invoice.id}/receipt", headers=auth_headers
        )
    assert response.status_code == 200
    assert response.json()["receipt_number"] == invoice.receipt_number
    assert response.json()["download_url"] == "https://storage.example/receipt.pdf"


@pytest.mark.asyncio
async def test_receipt_unavailable_for_pending_invoice(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import invoice_repo, plan_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=777001,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    await db.commit()

    polled = await client.get(f"/api/v1/subscription/invoices/{invoice.id}", headers=auth_headers)
    assert polled.status_code == 200
    assert polled.json()["status"] == "pending"  # MSG29: front-end keeps showing "confirming"

    receipt = await client.get(
        f"/api/v1/subscription/invoices/{invoice.id}/receipt", headers=auth_headers
    )
    assert receipt.status_code == 409
    assert receipt.json()["code"] == "RECEIPT_UNAVAILABLE"


@pytest.mark.asyncio
async def test_coupon_discounts_checkout_and_is_single_use_per_account(
    client, db, auth_headers, authenticated_user
):
    _admin_user, admin_headers = await _admin(db, "fin-admin@example.com", "finadmin")
    created = await client.post(
        "/api/v1/admin/billing/coupons",
        headers=admin_headers,
        json={"code": "save50k", "discount_type": "fixed", "value": 50000},
    )
    assert created.status_code == 201
    assert created.json()["code"] == "SAVE50K"

    preview = await client.post(
        "/api/v1/subscription/coupon/preview",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "save50k"},
    )
    assert preview.status_code == 200
    assert preview.json()["amount_vnd"] == preview.json()["listed_price_vnd"] - 50000

    invoice = await _pay(client, db, auth_headers, authenticated_user, coupon_code="SAVE50K")
    assert invoice.discount_vnd == 50000
    assert invoice.amount_vnd == invoice.listed_price_vnd - 50000
    assert invoice.status == "paid"

    again = await client.post(
        "/api/v1/subscription/coupon/preview",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "SAVE50K"},
    )
    assert again.status_code == 422
    assert again.json()["code"] == "COUPON_INVALID"


@pytest.mark.asyncio
async def test_first_payment_only_coupon_rejected_after_a_paid_invoice(
    client, db, auth_headers, authenticated_user
):
    _admin_user, admin_headers = await _admin(db, "fin-admin@example.com", "finadmin")
    await client.post(
        "/api/v1/admin/billing/coupons",
        headers=admin_headers,
        json={
            "code": "EARLYBIRD",
            "discount_type": "fixed_price",
            "value": 129000,
            "plan_tiers": ["basic"],
            "first_payment_only": True,
        },
    )
    await _pay(client, db, auth_headers, authenticated_user)  # a normal paid order first

    response = await client.post(
        "/api/v1/subscription/coupon/preview",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "EARLYBIRD"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_manual_transaction_needs_second_admin_and_proof(
    client, db, authenticated_user
):
    admin_a, headers_a = await _admin(db, "maker@example.com", "maker")
    _admin_b, headers_b = await _admin(db, "checker@example.com", "checker")
    body = {
        "user_id": str(authenticated_user.id),
        "tier": "basic",
        "amount_vnd": 259000,
        "paid_on": datetime.now(UTC).date().isoformat(),
        "collected_by": "Sales R4",
        "proof_path": f"payment-proofs/{admin_a.id}/proof.jpg",
        "reason": "Khách trả tiền mặt tại buổi demo",
    }

    no_proof = await client.post(
        "/api/v1/admin/billing/manual-transactions",
        headers=headers_a,
        json={**body, "proof_path": "somewhere/else.jpg"},
    )
    assert no_proof.status_code == 422
    assert no_proof.json()["code"] == "MANUAL_PAYMENT_INVALID"

    created = await client.post(
        "/api/v1/admin/billing/manual-transactions", headers=headers_a, json=body
    )
    assert created.status_code == 201
    invoice_id = created.json()["id"]
    assert created.json()["status"] == "awaiting_approval"

    self_approve = await client.post(
        f"/api/v1/admin/billing/invoices/{invoice_id}/approve", headers=headers_a
    )
    assert self_approve.status_code == 403
    assert self_approve.json()["code"] == "MANUAL_PAYMENT_SELF_APPROVAL"

    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        approved = await client.post(
            f"/api/v1/admin/billing/invoices/{invoice_id}/approve", headers=headers_b
        )
    assert approved.status_code == 200
    assert approved.json()["status"] == "paid"
    assert approved.json()["receipt_number"].startswith("KUS-")

    from app.repositories import subscription_repo

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "basic_monthly"


@pytest.mark.asyncio
async def test_locked_period_blocks_manual_entry_and_refund(
    client, db, auth_headers, authenticated_user
):
    admin_a, headers_a = await _admin(db, "maker@example.com", "maker")
    today = datetime.now(UTC).date()

    period = await client.post(
        "/api/v1/admin/billing/periods",
        headers=headers_a,
        json={
            "name": "Kỳ Outcome 2",
            "start_date": (today - timedelta(days=30)).isoformat(),
            "end_date": (today + timedelta(days=30)).isoformat(),
        },
    )
    assert period.status_code == 201
    overlap = await client.post(
        "/api/v1/admin/billing/periods",
        headers=headers_a,
        json={"name": "trùng", "start_date": today.isoformat(), "end_date": today.isoformat()},
    )
    assert overlap.status_code == 422

    invoice = await _pay(client, db, auth_headers, authenticated_user)

    locked = await client.post(
        f"/api/v1/admin/billing/periods/{period.json()['id']}/lock", headers=headers_a
    )
    assert locked.status_code == 200
    assert locked.json()["status"] == "locked"

    manual = await client.post(
        "/api/v1/admin/billing/manual-transactions",
        headers=headers_a,
        json={
            "user_id": str(authenticated_user.id),
            "tier": "pro",
            "amount_vnd": 649000,
            "paid_on": today.isoformat(),
            "collected_by": "R4",
            "proof_path": f"payment-proofs/{admin_a.id}/p.jpg",
            "reason": "test",
        },
    )
    assert manual.status_code == 409
    assert manual.json()["code"] == "PERIOD_LOCKED"

    refund = await client.post(
        f"/api/v1/admin/billing/invoices/{invoice.id}/refund",
        headers=headers_a,
        json={"amount_vnd": invoice.amount_vnd, "reason": "test"},
    )
    assert refund.status_code == 409
    assert refund.json()["code"] == "PERIOD_LOCKED"


@pytest.mark.asyncio
async def test_refund_policy_window_override_and_downgrade(
    client, db, auth_headers, authenticated_user
):
    _admin_user, admin_headers = await _admin(db, "fin-admin@example.com", "finadmin")
    invoice = await _pay(client, db, auth_headers, authenticated_user)
    invoice.paid_at = datetime.now(UTC) - timedelta(days=10)
    await db.commit()
    body = {"amount_vnd": invoice.amount_vnd, "reason": "Khách yêu cầu"}

    denied = await client.post(
        f"/api/v1/admin/billing/invoices/{invoice.id}/refund", headers=admin_headers, json=body
    )
    assert denied.status_code == 409
    assert denied.json()["code"] == "REFUND_POLICY_VIOLATION"

    approved = await client.post(
        f"/api/v1/admin/billing/invoices/{invoice.id}/refund",
        headers=admin_headers,
        json={**body, "override": True},
    )
    assert approved.status_code == 200

    from app.repositories import subscription_repo

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "free"  # full refund of the current plan payment


@pytest.mark.asyncio
async def test_stale_pending_invoice_cancelled_but_late_webhook_still_activates(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import invoice_repo, plan_repo, subscription_repo
    from app.services import billing_service

    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=888001,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    invoice.created_at = datetime.now(UTC) - timedelta(minutes=45)
    await db.commit()

    assert await billing_service.cancel_stale_pending_invoices(db) == 1
    await db.refresh(invoice)
    assert invoice.status == "cancelled"

    data = {
        "orderCode": invoice.order_code,
        "amount": invoice.amount_vnd,
        "reference": "LATE1",
        "code": "00",
        "desc": "success",
    }
    payload = {"code": "00", "success": True, "data": data, "signature": _payos_signature(data)}
    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        hook = await client.post("/api/v1/webhooks/payos", json=payload)
    assert hook.status_code == 200

    await db.refresh(invoice)
    assert invoice.status == "paid"  # BR-30: money was collected, so deliver the plan
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "basic_monthly"


@pytest.mark.asyncio
async def test_admin_grants_comp_plan_without_revenue(client, db, authenticated_user):
    _admin_user, admin_headers = await _admin(db, "fin-admin@example.com", "finadmin")
    response = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/grant-plan",
        headers=admin_headers,
        json={"tier": "pro", "days": 14, "reason": "Bồi hoàn sự cố"},
    )
    assert response.status_code == 200
    assert response.json()["is_comp"] is True

    from app.repositories import invoice_repo, subscription_repo

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.is_comp is True
    assert subscription.tier == "pro_monthly"
    assert await invoice_repo.has_paid_invoice(db, authenticated_user.id) is False
