"""Track A: BR-94 / UC-27 scan Credits, BR-23 plan-then-Credit deduction, and the
Credit-aware analytics split (RUNBOOK §9.1 / §9.2).

SRS: BR-94 SRS_v2.2.txt:1617, :2856; BR-23 :1561; MSG28 :2356; MSG51 :2494; MRR :2551."""
import asyncio
import hashlib
import hmac
import re
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.exceptions import ScanQuotaExhausted, SubGracePeriodScanBlocked
from app.models.invoice import Invoice
from app.models.monthly_usage import MonthlyUsage
from app.models.scan_credit import (
    CREDIT_BILLING_CYCLE,
    CREDIT_INVOICE_TIER,
    CREDIT_STATUS_AVAILABLE,
    CREDIT_STATUS_EXPIRED,
    CREDIT_STATUS_REVOKED,
    CREDIT_STATUS_USED,
    ScanCredit,
)
from app.repositories import (
    invoice_repo,
    monthly_usage_repo,
    plan_repo,
    subscription_repo,
    user_repo,
)
from app.services import analytics_service, credit_service, quota_service
from app.services.period_service import GMT7
from app.utils.jwt import create_access_token
from tests.conftest import TEST_DATABASE_URL

CONSUME_URL = "/api/v1/internal/scan-quota/consume"
CHECKOUT_URL = "/api/v1/subscription/credits/checkout"


# --- helpers -------------------------------------------------------------------------


def _headers(user, role="user") -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), role=role)}"}


async def _user(db, email: str, username: str):
    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Credit",
        last_name="Tester",
    )
    user.is_verified = True
    free = await plan_repo.get_free_plan(db)
    await subscription_repo.create_free(db, user_id=user.id, plan_id=free.id)
    await db.commit()
    return user


async def _admin_headers(db) -> dict:
    admin = await _user(db, "credit-admin@example.com", "creditadmin")
    admin.role = "admin"
    await db.commit()
    return _headers(admin, role="admin")


async def _subscribe(db, user, tier: str = "basic", *, status: str = "active"):
    """Put the user on an ACTIVE (or given status) monthly paid plan anchored yesterday."""
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, "monthly")
    subscription = await subscription_repo.get_by_user(db, user.id)
    subscription.plan = plan
    subscription.tier = f"{tier}_monthly"
    subscription.status = status
    subscription.current_period_start = datetime.now(UTC) - timedelta(days=1)
    subscription.expires_at = subscription.current_period_start + timedelta(days=30)
    await db.commit()
    return subscription


async def _grant(db, user, *, expires_in_days: float, purchased_days_ago: float = 1):
    """Insert one Credit row directly (for quota tests that do not exercise the purchase)."""
    now = datetime.now(UTC)
    subscription = await subscription_repo.get_by_user(db, user.id)
    credit = ScanCredit(
        user_id=user.id,
        invoice_id=None,
        purchased_at=now - timedelta(days=purchased_days_ago),
        expires_at=now + timedelta(days=expires_in_days),
        purchase_cycle_start=quota_service.current_period_start(subscription),
        price_vnd=settings.CREDIT_PRICE_VND,
    )
    db.add(credit)
    await db.commit()
    return credit


async def _credits(db, user) -> list[ScanCredit]:
    result = await db.execute(
        select(ScanCredit)
        .where(ScanCredit.user_id == user.id)
        .order_by(ScanCredit.expires_at)
        .execution_options(populate_existing=True)
    )
    return list(result.scalars())


async def _usage(db, user, subscription) -> MonthlyUsage | None:
    return await monthly_usage_repo.get_period(
        db, user.id, quota_service.current_period_start(subscription)
    )


async def _run_expire_task() -> dict:
    """Run the real Celery task body (asyncio.run inside) on its own thread, bound to the
    test database through a NullPool engine so no connection crosses event loops."""
    from app.workers.celery_app import celery_app
    from app.workers.tasks import credit_tasks

    name = "app.workers.tasks.credit_tasks.expire_scan_credits"
    assert name in celery_app.tasks
    assert celery_app.conf.beat_schedule["expire-scan-credits-daily"]["task"] == name
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        with patch.object(
            credit_tasks, "AsyncSessionLocal", async_sessionmaker(engine, expire_on_commit=False)
        ):
            return await asyncio.to_thread(credit_tasks.expire_scan_credits.run)
    finally:
        await engine.dispose()


def _payos_payload(order_code: int, amount: int) -> dict:
    data = {
        "orderCode": order_code,
        "amount": amount,
        "description": "KusShoes Credit",
        "reference": f"FT{order_code}",
        "code": "00",
        "desc": "success",
    }
    raw = "&".join(f"{k}={data[k]}" for k in sorted(data))
    signature = hmac.new(
        settings.PAYOS_CHECKSUM_KEY.encode(), raw.encode(), hashlib.sha256
    ).hexdigest()
    return {"code": "00", "desc": "success", "success": True, "data": data, "signature": signature}


async def _checkout(client, headers, quantity: int, **extra):
    link = ("https://pay.payos.vn/web/credit", f"link-{uuid.uuid4().hex}")
    with patch(
        "app.infrastructure.payos_client.create_payment_link", new=AsyncMock(return_value=link)
    ):
        return await client.post(
            CHECKOUT_URL, headers=headers, json={"quantity": quantity, "gateway": "payos", **extra}
        )


async def _latest_pending_credit_invoice(db, user) -> Invoice:
    invoices = await invoice_repo.list_by_user(db, user.id, limit=50)
    return next(
        i for i in invoices if i.plan_tier == CREDIT_INVOICE_TIER and i.status == "pending"
    )


async def _post_webhook(client, invoice: Invoice):
    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email") as mail:
        response = await client.post(
            "/api/v1/webhooks/payos", json=_payos_payload(invoice.order_code, invoice.amount_vnd)
        )
    assert response.status_code == 200
    return mail


async def _buy(client, db, user, headers, quantity: int) -> Invoice:
    response = await _checkout(client, headers, quantity)
    assert response.status_code == 200, response.text
    invoice = await _latest_pending_credit_invoice(db, user)
    await _post_webhook(client, invoice)
    await db.refresh(invoice)
    assert invoice.status == "paid"
    return invoice


async def _consume(client, service_headers, user, reference: str):
    return await client.post(
        CONSUME_URL,
        headers=service_headers,
        json={"user_id": str(user.id), "reference": reference},
    )


# --- A1: purchase gate, cap, minting, expiry, ledger -----------------------------------


@pytest.mark.asyncio
async def test_free_user_cannot_buy_credit(client, db, auth_headers, authenticated_user):
    response = await _checkout(client, auth_headers, 1)
    assert response.status_code == 403
    assert response.json()["code"] == "CREDIT_REQUIRES_PAID_PLAN"
    assert await _credits(db, authenticated_user) == []


@pytest.mark.asyncio
async def test_grace_user_cannot_buy_credit(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "basic", status="grace")
    response = await _checkout(client, auth_headers, 1)
    assert response.status_code == 403
    assert response.json()["code"] == "CREDIT_REQUIRES_PAID_PLAN"


@pytest.mark.asyncio
async def test_basic_user_buys_three_credits_with_12_month_expiry(
    client, db, auth_headers, authenticated_user
):
    assert settings.CREDIT_VALIDITY_MONTHS == 12  # SRS_v2.2.txt:1617 "hạn dùng 12 tháng"
    await _subscribe(db, authenticated_user, "basic")
    invoice = await _buy(client, db, authenticated_user, auth_headers, 3)

    assert invoice.plan_id is None
    assert invoice.plan_tier == CREDIT_INVOICE_TIER
    assert invoice.billing_cycle == CREDIT_BILLING_CYCLE
    assert invoice.listed_price_vnd == settings.CREDIT_PRICE_VND * 3
    assert invoice.amount_vnd == invoice.listed_price_vnd
    assert invoice.is_upgrade is False and invoice.is_manual is False

    credits = await _credits(db, authenticated_user)
    assert len(credits) == 3
    paid_at = invoice.paid_at
    for credit in credits:
        assert credit.status == CREDIT_STATUS_AVAILABLE
        assert credit.invoice_id == invoice.id
        assert credit.purchased_at == paid_at
        assert credit.expires_at == paid_at.replace(year=paid_at.year + 1)
        assert credit.price_vnd == settings.CREDIT_PRICE_VND


def test_credit_expiry_month_arithmetic_clamps_day():
    assert credit_service.add_months(datetime(2027, 1, 31, 9, 30, tzinfo=UTC), 12) == datetime(
        2028, 1, 31, 9, 30, tzinfo=UTC
    )
    assert credit_service.add_months(datetime(2028, 2, 29, tzinfo=UTC), 12) == datetime(
        2029, 2, 28, tzinfo=UTC
    )
    assert credit_service.add_months(datetime(2027, 1, 31, tzinfo=UTC), 1) == datetime(
        2027, 2, 28, tzinfo=UTC
    )


@pytest.mark.asyncio
async def test_fourth_credit_in_cycle_is_rejected_msg51(
    client, db, auth_headers, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    await _buy(client, db, authenticated_user, auth_headers, 3)

    response = await _checkout(client, auth_headers, 1)
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "CREDIT_CYCLE_LIMIT"
    assert body["purchased"] == 3 and body["limit"] == 3
    assert body["message"] == "Mỗi chu kỳ mua tối đa 3 Credit quét."  # MSG51 SRS_v2.2.txt:2494
    assert len(await _credits(db, authenticated_user)) == 3


@pytest.mark.asyncio
async def test_pending_credit_checkouts_count_toward_cycle_cap(
    client, db, auth_headers, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    first = await _checkout(client, auth_headers, 2)
    assert first.status_code == 200  # left PENDING, never paid
    second = await _checkout(client, auth_headers, 2)
    assert second.status_code == 409
    assert second.json()["purchased"] == 2
    third = await _checkout(client, auth_headers, 1)
    assert third.status_code == 200


@pytest.mark.asyncio
async def test_credit_checkout_rejects_coupon_code(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    response = await _checkout(client, auth_headers, 1, coupon_code="EARLYBIRD")
    assert response.status_code == 422
    assert await invoice_repo.list_by_user(db, authenticated_user.id, limit=10) == []


@pytest.mark.asyncio
async def test_credits_survive_cycle_rollover(client, db, auth_headers, authenticated_user):
    subscription = await _subscribe(db, authenticated_user, "basic")
    old_anchor = subscription.current_period_start
    await _buy(client, db, authenticated_user, auth_headers, 3)
    assert (await _checkout(client, auth_headers, 1)).status_code == 409

    # Renewal payment for the plan moves the cycle anchor (BR-23).
    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    renewal = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=77000001,
        listed_price_vnd=plan.price_vnd,
        amount_vnd=plan.price_vnd,
        payment_method="payos",
    )
    await db.commit()
    await _post_webhook(client, renewal)
    await db.refresh(subscription)
    assert subscription.current_period_start != old_anchor

    credits = await _credits(db, authenticated_user)
    assert [c.status for c in credits] == [CREDIT_STATUS_AVAILABLE] * 3  # SRS_v2.2.txt:2856
    assert (await _checkout(client, auth_headers, 1)).status_code == 200  # cap reset


@pytest.mark.asyncio
async def test_credit_webhook_is_idempotent(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    assert (await _checkout(client, auth_headers, 3)).status_code == 200
    invoice = await _latest_pending_credit_invoice(db, authenticated_user)
    first = await _post_webhook(client, invoice)
    second = await _post_webhook(client, invoice)
    assert len(await _credits(db, authenticated_user)) == 3
    assert first.call_count == 1 and second.call_count == 0


@pytest.mark.asyncio
async def test_credit_invoice_does_not_change_subscription(
    client, db, auth_headers, authenticated_user
):
    subscription = await _subscribe(db, authenticated_user, "basic")
    before = (
        subscription.tier,
        subscription.expires_at,
        subscription.current_period_start,
        subscription.last_invoice_id,
        subscription.plan_id,
    )
    await _buy(client, db, authenticated_user, auth_headers, 3)
    await db.refresh(subscription)
    after = (
        subscription.tier,
        subscription.expires_at,
        subscription.current_period_start,
        subscription.last_invoice_id,
        subscription.plan_id,
    )
    assert after == before


@pytest.mark.asyncio
async def test_credit_receipt_item_line(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    invoice = await _buy(client, db, authenticated_user, auth_headers, 3)
    assert invoice.receipt_number is not None
    assert invoice.receipt_snapshot["item"] == "Credit quét × 3"
    assert "Tháng" not in invoice.receipt_snapshot["item"]
    assert invoice.receipt_snapshot["amount"] == settings.CREDIT_PRICE_VND * 3


@pytest.mark.asyncio
async def test_expired_credit_is_not_spendable_before_job_runs(
    client, db, auth_headers, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    lapsed = await _grant(db, authenticated_user, expires_in_days=-1, purchased_days_ago=400)
    await _grant(db, authenticated_user, expires_in_days=30)

    body = (await client.get("/api/v1/subscription/credits", headers=auth_headers)).json()
    assert body["available"] == 1 and body["expired"] == 1
    assert (await _credits(db, authenticated_user))[0].status == CREDIT_STATUS_AVAILABLE

    result = await _run_expire_task()
    assert result == {"status": "completed", "expired": 1}
    await db.refresh(lapsed)
    assert lapsed.status == CREDIT_STATUS_EXPIRED
    body = (await client.get("/api/v1/subscription/credits", headers=auth_headers)).json()
    assert body["available"] == 1 and body["expired"] == 1


@pytest.mark.asyncio
async def test_credit_balance_reports_cap_and_price(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "pro")
    await _buy(client, db, authenticated_user, auth_headers, 2)
    body = (await client.get("/api/v1/subscription/credits", headers=auth_headers)).json()
    assert body["available"] == 2
    assert body["purchased_this_cycle"] == 2
    assert body["max_per_cycle"] == settings.CREDIT_MAX_PER_CYCLE
    assert body["price_vnd"] == settings.CREDIT_PRICE_VND
    assert body["can_purchase"] is True
    assert body["next_expires_at"] is not None


@pytest.mark.asyncio
async def test_credit_ledger_is_scoped_to_owner(client, db, auth_headers, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    for days in (10, 20, 30):
        await _grant(db, authenticated_user, expires_in_days=300, purchased_days_ago=days)
    other = await _user(db, "credit-other@example.com", "creditother")
    await _subscribe(db, other, "basic")
    await _grant(db, other, expires_in_days=300)

    page1 = (
        await client.get("/api/v1/subscription/credits/ledger?limit=2", headers=auth_headers)
    ).json()
    assert len(page1["items"]) == 2 and page1["has_next"] is True
    page2 = (
        await client.get(
            f"/api/v1/subscription/credits/ledger?limit=2&cursor={page1['next_cursor']}",
            headers=auth_headers,
        )
    ).json()
    assert len(page2["items"]) == 1 and page2["has_next"] is False and page2["next_cursor"] is None
    mine = {c.id for c in await _credits(db, authenticated_user)}
    seen = {uuid.UUID(item["id"]) for item in page1["items"] + page2["items"]}
    assert seen == mine

    other_page = (
        await client.get("/api/v1/subscription/credits/ledger", headers=_headers(other))
    ).json()
    assert len(other_page["items"]) == 1
    assert uuid.UUID(other_page["items"][0]["id"]) not in mine


@pytest.mark.asyncio
async def test_credit_refund_revokes_only_available_credits(
    client, db, auth_headers, authenticated_user, service_headers
):
    admin_headers = await _admin_headers(db)
    await _subscribe(db, authenticated_user, "basic")
    subscription_before = (await subscription_repo.get_by_user(db, authenticated_user.id)).tier
    invoice = await _buy(client, db, authenticated_user, auth_headers, 2)
    assert (await _consume(client, service_headers, authenticated_user, "scan-plan-0001")).json()[
        "source"
    ] == "plan"
    assert (await _consume(client, service_headers, authenticated_user, "scan-cred-0001")).json()[
        "source"
    ] == "credit"

    refund_url = f"/api/v1/admin/billing/invoices/{invoice.id}/refund"
    blocked = await client.post(
        refund_url, headers=admin_headers, json={"amount_vnd": invoice.amount_vnd, "reason": "x"}
    )
    assert blocked.status_code == 409  # BR-97 SRS_v2.2.txt:1680: a used Credit is not refunded
    allowed = await client.post(
        refund_url,
        headers=admin_headers,
        json={"amount_vnd": invoice.amount_vnd, "reason": "x", "override": True},
    )
    assert allowed.status_code in (200, 201), allowed.text

    statuses = sorted(c.status for c in await _credits(db, authenticated_user))
    assert statuses == sorted([CREDIT_STATUS_USED, CREDIT_STATUS_REVOKED])
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    await db.refresh(subscription)
    assert subscription.tier == subscription_before  # a Credit refund never downgrades


@pytest.mark.asyncio
async def test_credit_revenue_appears_in_admin_analytics(
    client, db, auth_headers, authenticated_user
):
    admin_headers = await _admin_headers(db)
    await _subscribe(db, authenticated_user, "basic")
    await _buy(client, db, authenticated_user, auth_headers, 1)
    body = (await client.get("/api/v1/admin/analytics", headers=admin_headers)).json()
    # Credit has its own line, not a fake "plan tier" row in revenue_by_plan.
    assert body["credit_revenue_vnd"] == settings.CREDIT_PRICE_VND
    assert CREDIT_INVOICE_TIER not in {row["plan_tier"] for row in body["revenue_by_plan"]}
    assert body["revenue_vnd"]["current"] == settings.CREDIT_PRICE_VND


# --- §9.2: recurring metrics exclude Credit, cash metrics include it -------------------


async def _paid(db, user, *, tier: str, cycle: str, amount: int, paid_at: datetime, order: int):
    plan = None if tier == CREDIT_INVOICE_TIER else await plan_repo.get_by_tier_and_cycle(
        db, tier, cycle
    )
    invoice = Invoice(
        user_id=user.id,
        plan_id=plan.id if plan else None,
        plan_tier=tier,
        billing_cycle=cycle,
        order_code=order,
        listed_price_vnd=amount,
        discount_vnd=0,
        amount_vnd=amount,
        payment_method="payos",
        status="paid",
        paid_at=paid_at,
    )
    db.add(invoice)
    await db.commit()
    return invoice


@pytest.mark.asyncio
async def test_pro_customer_buying_credit_keeps_plan_mrr_and_does_not_churn(
    client, db, authenticated_user
):
    admin_headers = await _admin_headers(db)
    pro = await plan_repo.get_by_tier_and_cycle(db, "pro", "monthly")
    await _subscribe(db, authenticated_user, "pro")
    now = datetime.now(UTC)
    plan_paid = now - timedelta(days=20)
    credit_paid = now - timedelta(days=5)
    await _paid(db, authenticated_user, tier="pro", cycle="monthly", amount=pro.price_vnd,
                paid_at=plan_paid, order=88000001)
    await _paid(db, authenticated_user, tier=CREDIT_INVOICE_TIER, cycle=CREDIT_BILLING_CYCLE,
                amount=settings.CREDIT_PRICE_VND, paid_at=credit_paid, order=88000002)

    body = (await client.get("/api/v1/admin/analytics", headers=admin_headers)).json()
    assert body["mrr_vnd"] == pro.price_vnd  # not the latest (Credit) payment
    assert body["arr_vnd"] == pro.price_vnd * 12
    assert body["arpu_vnd"] == pro.price_vnd
    assert body["paying_customers"] == 1
    assert body["repeat"]["repeat_customers"] == 0  # a Credit is not a plan renewal

    # The date the Credit would "come due" if it were treated as a monthly plan cycle.
    phantom_due = analytics_service.business_date(analytics_service.add_months(credit_paid, 1))
    window = f"date_from={phantom_due.isoformat()}&date_to={phantom_due.isoformat()}"
    churn = (await client.get(f"/api/v1/admin/analytics?{window}", headers=admin_headers)).json()
    assert churn["churn"]["due"] == 0 and churn["churn"]["churned"] == 0


@pytest.mark.asyncio
async def test_credit_revenue_counts_as_cash_revenue(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    pro = await plan_repo.get_by_tier_and_cycle(db, "pro", "monthly")
    now = datetime.now(UTC)
    await _paid(db, authenticated_user, tier="pro", cycle="monthly", amount=pro.price_vnd,
                paid_at=now - timedelta(days=3), order=88000011)
    await _paid(db, authenticated_user, tier=CREDIT_INVOICE_TIER, cycle=CREDIT_BILLING_CYCLE,
                amount=settings.CREDIT_PRICE_VND, paid_at=now - timedelta(days=1), order=88000012)

    body = (await client.get("/api/v1/admin/analytics", headers=admin_headers)).json()
    total = pro.price_vnd + settings.CREDIT_PRICE_VND
    assert body["revenue_vnd"]["current"] == total
    # Credit has its own line, not a fake "plan tier" row in revenue_by_plan.
    by_plan = {row["plan_tier"]: row["revenue_vnd"] for row in body["revenue_by_plan"]}
    assert by_plan == {"pro": pro.price_vnd}
    assert body["credit_revenue_vnd"] == settings.CREDIT_PRICE_VND
    assert sum(point["revenue_vnd"] for point in body["revenue_series"]) == total
    assert body["top_customers"][0]["net_paid_vnd"] == total
    assert body["top_customers"][0]["orders"] == 2


# --- A2: plan first, Credit second -----------------------------------------------------


@pytest.mark.asyncio
async def test_plan_scan_is_consumed_before_credit(
    client, db, authenticated_user, service_headers
):
    subscription = await _subscribe(db, authenticated_user, "basic")
    assert subscription.plan.max_scans_per_cycle == 1  # plan table SRS_v2.2.txt:902
    await _grant(db, authenticated_user, expires_in_days=100)
    await _grant(db, authenticated_user, expires_in_days=200)

    first = await _consume(client, service_headers, authenticated_user, "scan-job-0001")
    assert first.status_code == 200
    assert first.json() == {"source": "plan", "plan_remaining": 0, "credit_available": 2}
    assert (await _usage(db, authenticated_user, subscription)).scans_used == 1

    second = await _consume(client, service_headers, authenticated_user, "scan-job-0002")
    assert second.json() == {"source": "credit", "plan_remaining": 0, "credit_available": 1}
    third = await _consume(client, service_headers, authenticated_user, "scan-job-0003")
    assert third.json() == {"source": "credit", "plan_remaining": 0, "credit_available": 0}

    fourth = await _consume(client, service_headers, authenticated_user, "scan-job-0004")
    assert fourth.status_code == 409
    assert fourth.json()["code"] == "SCAN_QUOTA_EXHAUSTED"
    assert (await _usage(db, authenticated_user, subscription)).scans_used == 1


@pytest.mark.asyncio
async def test_credits_consumed_oldest_expiry_first(
    client, db, authenticated_user, service_headers
):
    await _subscribe(db, authenticated_user, "basic")
    late = await _grant(db, authenticated_user, expires_in_days=300, purchased_days_ago=1)
    soon = await _grant(db, authenticated_user, expires_in_days=10, purchased_days_ago=3)
    middle = await _grant(db, authenticated_user, expires_in_days=100, purchased_days_ago=2)
    await _consume(client, service_headers, authenticated_user, "scan-fifo-plan")

    order = []
    for index in range(3):
        response = await _consume(client, service_headers, authenticated_user, f"scan-fifo-{index}")
        assert response.json()["source"] == "credit"
        used = {c.id for c in await _credits(db, authenticated_user) if c.status == "used"}
        order.append(next(iter(used - set(order))))
    assert order == [soon.id, middle.id, late.id]


@pytest.mark.asyncio
async def test_expired_credit_is_skipped_by_consume(
    client, db, authenticated_user, service_headers
):
    await _subscribe(db, authenticated_user, "basic")
    lapsed = await _grant(db, authenticated_user, expires_in_days=-1, purchased_days_ago=400)
    await _consume(client, service_headers, authenticated_user, "scan-exp-plan")

    response = await _consume(client, service_headers, authenticated_user, "scan-exp-0001")
    assert response.status_code == 409
    assert response.json()["code"] == "SCAN_QUOTA_EXHAUSTED"
    await db.refresh(lapsed)
    assert lapsed.status == CREDIT_STATUS_AVAILABLE and lapsed.consumed_ref is None


@pytest.mark.asyncio
async def test_used_credit_is_never_restored(client, db, authenticated_user, service_headers):
    await _subscribe(db, authenticated_user, "basic")
    credit = await _grant(db, authenticated_user, expires_in_days=30)
    await _consume(client, service_headers, authenticated_user, "scan-used-plan")
    assert (
        await _consume(client, service_headers, authenticated_user, "scan-used-0001")
    ).json()["source"] == "credit"
    used_key = quota_service.reference_key(authenticated_user.id, "scan-used-0001")

    await _run_expire_task()
    await db.refresh(credit)
    assert credit.status == CREDIT_STATUS_USED and credit.consumed_ref == used_key
    again = await _consume(client, service_headers, authenticated_user, "scan-used-0002")
    assert again.status_code == 409
    await db.refresh(credit)
    assert credit.status == CREDIT_STATUS_USED and credit.consumed_ref == used_key


@pytest.mark.asyncio
async def test_scan_quota_exhausted_returns_msg28(
    client, db, authenticated_user, service_headers
):
    response = await _consume(client, service_headers, authenticated_user, "scan-free-0001")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "SCAN_QUOTA_EXHAUSTED"
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    expected_reset = quota_service.next_period_start(subscription)
    assert datetime.fromisoformat(body["resets_at"]) == expected_reset
    # MSG28 SRS_v2.2.txt:2356, {ngày reset} rendered as the GMT+7 business date
    reset_day = expected_reset.astimezone(GMT7).strftime("%d/%m/%Y")
    assert re.fullmatch(r"\d{2}/\d{2}/\d{4}", reset_day)
    assert body["message"] == (
        "Bạn đã dùng hết lượt quét của chu kỳ. "
        f"Mua Credit (49.000đ/lượt) hoặc chờ đến {reset_day}."
    )


@pytest.mark.asyncio
async def test_cycle_rollover_resets_plan_scans_only(
    client, db, authenticated_user, service_headers
):
    subscription = await _subscribe(db, authenticated_user, "basic")
    await _grant(db, authenticated_user, expires_in_days=60)
    await _consume(client, service_headers, authenticated_user, "scan-roll-0001")
    url = f"/api/v1/internal/scan-quota/{authenticated_user.id}"
    before = (await client.get(url, headers=service_headers)).json()
    assert before["plan_remaining"] == 0 and before["credit_available"] == 1

    subscription.current_period_start = datetime.now(UTC)  # a renewal moved the anchor
    await db.commit()
    after = (await client.get(url, headers=service_headers)).json()
    assert after["plan_remaining"] == 1 and after["credit_available"] == 1
    assert (await _usage(db, authenticated_user, subscription)) is None  # fresh cycle, 0 used


@pytest.mark.asyncio
async def test_consume_is_idempotent_per_reference(
    client, db, authenticated_user, service_headers
):
    await _subscribe(db, authenticated_user, "basic")
    await _grant(db, authenticated_user, expires_in_days=30)
    await _grant(db, authenticated_user, expires_in_days=60)
    await _consume(client, service_headers, authenticated_user, "scan-idem-plan")

    first = await _consume(client, service_headers, authenticated_user, "scan-idem-0001")
    replay = await _consume(client, service_headers, authenticated_user, "scan-idem-0001")
    assert first.status_code == 200 and replay.status_code == 200
    assert first.json() == replay.json() == {
        "source": "credit",
        "plan_remaining": 0,
        "credit_available": 1,
    }
    used = [c for c in await _credits(db, authenticated_user) if c.status == CREDIT_STATUS_USED]
    assert len(used) == 1


@pytest.mark.asyncio
async def test_same_reference_for_two_users_never_collides(
    client, db, authenticated_user, service_headers
):
    """F8: the unique consumed_ref index is global, so the stored key is namespaced by user.
    The same caller reference for two users spends one Credit each, and no 500."""
    other = await _user(db, "credit-ref@example.com", "creditref")
    for user in (authenticated_user, other):
        await _subscribe(db, user, "basic")
        await _grant(db, user, expires_in_days=30)
        assert (await _consume(client, service_headers, user, f"plan-{user.id}")).json()[
            "source"
        ] == "plan"

    shared = "scan-shared-0001"
    first = await _consume(client, service_headers, authenticated_user, shared)
    second = await _consume(client, service_headers, other, shared)
    assert first.status_code == 200 and second.status_code == 200, second.text
    assert first.json()["source"] == second.json()["source"] == "credit"

    for user in (authenticated_user, other):
        used = [c for c in await _credits(db, user) if c.status == CREDIT_STATUS_USED]
        assert [c.consumed_ref for c in used] == [quota_service.reference_key(user.id, shared)]
    assert quota_service.reference_key(authenticated_user.id, shared) != (
        quota_service.reference_key(other.id, shared)
    )
    assert len(quota_service.reference_key(other.id, "x" * 100)) <= 100  # fits String(100)

    replay = await _consume(client, service_headers, other, shared)
    assert replay.status_code == 200 and replay.json() == second.json()


@pytest.mark.asyncio
async def test_subscription_response_exposes_scan_balance(
    client, db, auth_headers, authenticated_user, service_headers
):
    await _subscribe(db, authenticated_user, "pro")
    await _grant(db, authenticated_user, expires_in_days=30)
    await _consume(client, service_headers, authenticated_user, "scan-view-0001")

    mine = (await client.get("/api/v1/subscription", headers=auth_headers)).json()
    internal = (
        await client.get(
            f"/api/v1/internal/scan-quota/{authenticated_user.id}", headers=service_headers
        )
    ).json()
    assert mine["scans_remaining_plan"] == internal["plan_remaining"] == 2  # Pro 3 - 1
    assert mine["scans_remaining_credit"] == internal["credit_available"] == 1


@pytest.mark.asyncio
async def test_internal_quota_endpoints_require_service_token(client, authenticated_user):
    body = {"user_id": str(authenticated_user.id), "reference": "scan-auth-0001"}
    balance_url = f"/api/v1/internal/scan-quota/{authenticated_user.id}"
    wrong = {"X-Service-Token": "not-the-token"}

    assert (await client.post(CONSUME_URL, json=body)).status_code == 422  # header required
    assert (await client.get(balance_url)).status_code == 422
    consume_wrong = await client.post(CONSUME_URL, json=body, headers=wrong)
    assert consume_wrong.status_code == 401
    assert consume_wrong.json()["code"] == "AUTH_TOKEN_INVALID"
    assert (await client.get(balance_url, headers=wrong)).status_code == 401


# --- §9.1: non-mutating intake gate -----------------------------------------------------


async def _usage_rows(db, user) -> int:
    result = await db.execute(
        select(func.count()).select_from(MonthlyUsage).where(MonthlyUsage.user_id == user.id)
    )
    return int(result.scalar_one())


@pytest.mark.asyncio
async def test_assert_scan_available_free_user_without_credit_is_blocked(
    db, authenticated_user
):
    with pytest.raises(ScanQuotaExhausted):
        await quota_service.assert_scan_available(db, authenticated_user)


@pytest.mark.asyncio
async def test_assert_scan_available_plan_boundary_is_exact(db, authenticated_user):
    subscription = await _subscribe(db, authenticated_user, "pro")
    limit = subscription.plan.max_scans_per_cycle
    usage = await monthly_usage_repo.get_or_create_period(
        db, authenticated_user.id, quota_service.current_period_start(subscription)
    )
    usage.scans_used = limit - 1
    await db.commit()
    await quota_service.assert_scan_available(db, authenticated_user)  # one left: allowed

    usage.scans_used = limit
    await db.commit()
    with pytest.raises(ScanQuotaExhausted):
        await quota_service.assert_scan_available(db, authenticated_user)


@pytest.mark.asyncio
async def test_assert_scan_available_falls_back_to_unexpired_credit_only(
    db, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    usage = await monthly_usage_repo.get_or_create_period(
        db, authenticated_user.id, quota_service.current_period_start(subscription)
    )
    usage.scans_used = subscription.plan.max_scans_per_cycle
    await db.commit()

    await _grant(db, authenticated_user, expires_in_days=-1, purchased_days_ago=400)
    with pytest.raises(ScanQuotaExhausted):  # only an expired Credit: still blocked
        await quota_service.assert_scan_available(db, authenticated_user)

    await _grant(db, authenticated_user, expires_in_days=1)
    await quota_service.assert_scan_available(db, authenticated_user)


@pytest.mark.asyncio
async def test_assert_scan_available_is_non_mutating(db, authenticated_user):
    subscription = await _subscribe(db, authenticated_user, "basic")
    credit = await _grant(db, authenticated_user, expires_in_days=30)
    rows_before = await _usage_rows(db, authenticated_user)

    for _ in range(3):
        await quota_service.assert_scan_available(db, authenticated_user)
    await db.commit()

    assert await _usage_rows(db, authenticated_user) == rows_before
    assert await _usage(db, authenticated_user, subscription) is None  # no usage row created
    await db.refresh(credit)
    assert credit.status == CREDIT_STATUS_AVAILABLE and credit.consumed_ref is None
    balance = await quota_service.scan_balance(db, authenticated_user.id, subscription)
    assert (balance.plan_remaining, balance.credit_available) == (1, 1)


@pytest.mark.asyncio
async def test_increment_signatures_stay_backward_compatible(db, authenticated_user):
    """XR-5: Track B and bake_service call these with their original signatures."""
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    await quota_service.increment_projects(db, authenticated_user.id, subscription, 2)
    await quota_service.increment_exports(db, authenticated_user.id, subscription, 1)
    await db.commit()
    usage = await quota_service.get_usage(db, authenticated_user.id, subscription)
    await db.refresh(usage)
    assert (usage.projects_count, usage.exports_count, usage.scans_used) == (2, 1, 0)


# --- Round 3: BR-90 GRACE blocks scan intake (SRS_v2.2.txt:1582 "không quét") ---------


async def _set_scans_used(db, user, subscription, value: int) -> None:
    usage = await monthly_usage_repo.get_or_create_period(
        db, user.id, quota_service.current_period_start(subscription)
    )
    usage.scans_used = value
    await db.commit()


async def _intake_status(client, service_headers, user) -> dict:
    response = await client.get(
        f"/api/v1/internal/scan-quota/{user.id}", headers=service_headers
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_grace_with_plan_scans_left_is_blocked_at_intake(
    client, db, authenticated_user, service_headers
):
    subscription = await _subscribe(db, authenticated_user, "basic", status="grace")
    status = await _intake_status(client, service_headers, authenticated_user)
    assert status["plan_remaining"] == subscription.plan.max_scans_per_cycle  # scans left...
    assert status["can_scan"] is False  # ...but GRACE may not scan
    assert status["blocked_code"] == "SUB_GRACE_SCAN_BLOCKED"

    with pytest.raises(SubGracePeriodScanBlocked) as blocked:
        await quota_service.assert_scan_available(db, authenticated_user)
    assert blocked.value.status_code == 403
    assert blocked.value.code == "SUB_GRACE_SCAN_BLOCKED"

    # GRACE is checked before the balance: with nothing left it is still the GRACE refusal.
    await _set_scans_used(db, authenticated_user, subscription, subscription.plan.max_scans_per_cycle)
    with pytest.raises(SubGracePeriodScanBlocked):
        await quota_service.assert_scan_available(db, authenticated_user)


@pytest.mark.asyncio
async def test_grace_with_available_credit_is_blocked_and_credit_untouched(
    client, db, authenticated_user, service_headers
):
    subscription = await _subscribe(db, authenticated_user, "basic", status="grace")
    await _set_scans_used(db, authenticated_user, subscription, subscription.plan.max_scans_per_cycle)
    credit = await _grant(db, authenticated_user, expires_in_days=30)

    with pytest.raises(SubGracePeriodScanBlocked):
        await quota_service.assert_scan_available(db, authenticated_user)
    await db.commit()

    await db.refresh(credit)
    assert credit.status == CREDIT_STATUS_AVAILABLE and credit.consumed_ref is None
    assert (await _usage(db, authenticated_user, subscription)).scans_used == (
        subscription.plan.max_scans_per_cycle
    )
    status = await _intake_status(client, service_headers, authenticated_user)
    assert status["credit_available"] == 1
    assert status["can_scan"] is False and status["blocked_code"] == "SUB_GRACE_SCAN_BLOCKED"


@pytest.mark.asyncio
async def test_active_user_is_unaffected_by_grace_gate(
    client, db, authenticated_user, service_headers
):
    subscription = await _subscribe(db, authenticated_user, "basic", status="active")
    await quota_service.assert_scan_available(db, authenticated_user)
    status = await _intake_status(client, service_headers, authenticated_user)
    assert status["can_scan"] is True and status["blocked_code"] is None

    # The reported flag follows the same rule as the gate when an ACTIVE user runs out.
    await _set_scans_used(db, authenticated_user, subscription, subscription.plan.max_scans_per_cycle)
    with pytest.raises(ScanQuotaExhausted):
        await quota_service.assert_scan_available(db, authenticated_user)
    status = await _intake_status(client, service_headers, authenticated_user)
    assert status["can_scan"] is False and status["blocked_code"] == "SCAN_QUOTA_EXHAUSTED"


@pytest.mark.asyncio
async def test_scan_accepted_before_grace_is_still_charged(
    client, db, authenticated_user, service_headers
):
    """consume_scan charges an already-accepted scan; it deliberately ignores GRACE."""
    subscription = await _subscribe(db, authenticated_user, "basic", status="active")
    credit = await _grant(db, authenticated_user, expires_in_days=30)
    await quota_service.assert_scan_available(db, authenticated_user)  # job accepted (ACTIVE)
    await quota_service.assert_scan_available(db, authenticated_user)  # a second job accepted

    subscription.status = "grace"  # the plan lapses while both jobs are processing
    await db.commit()
    with pytest.raises(SubGracePeriodScanBlocked):  # new intake is refused...
        await quota_service.assert_scan_available(db, authenticated_user)

    first = await _consume(client, service_headers, authenticated_user, "scan-grace-0001")
    assert first.status_code == 200  # ...but the accepted jobs are still charged
    assert first.json()["source"] == "plan"
    assert (await _usage(db, authenticated_user, subscription)).scans_used == 1
    second = await _consume(client, service_headers, authenticated_user, "scan-grace-0002")
    assert second.status_code == 200 and second.json()["source"] == "credit"
    await db.refresh(credit)
    assert credit.status == CREDIT_STATUS_USED
