"""C2 — SF-14 / BR-79 API cost tracker and BR-108 CSV report (SRS_v2.2.txt:1767, :631, :2112)."""

import asyncio
import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import bcrypt
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.exceptions import ScanIntakeSuspended
from app.utils.jwt import create_access_token
from tests.conftest import TEST_DATABASE_URL

BUDGET_VND = 1_000_000  # acceptance criteria 4/5 of TASK_PACK C2
MSG43 = (  # SRS_v2.2.txt:2446
    "Hệ thống tạm ngưng nhận yêu cầu quét mới. Lượt quét của bạn được giữ nguyên; "
    "bạn vẫn có thể thiết kế trên phôi chuẩn."
)
ALERT = "app.infrastructure.task_queue.enqueue_api_budget_alert_email"


@pytest.fixture(autouse=True)
def mock_budget_alert():
    """Never reach Celery/SMTP; tests assert on the enqueue call instead."""
    with patch(ALERT) as mock:
        yield mock


def _today() -> date:
    from app.services.period_service import to_business_date

    return to_business_date(datetime.now(UTC))


async def _make_user(db, *, email, username, role="user", is_internal=False):
    from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo

    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Cost",
        last_name=role.title(),
        role=role,
    )
    user.is_verified = True
    user.is_internal = is_internal
    plan = await plan_repo.get_free_plan(db)
    await subscription_repo.create_free(db, user_id=user.id, plan_id=plan.id)
    await monthly_usage_repo.create_for_user(db, user_id=user.id, period_start=datetime.now(UTC))
    await db.commit()
    return user


async def _headers(db, role="admin"):
    user = await _make_user(db, email=f"{role}-cost@example.com", username=f"{role}cost", role=role)
    return {"Authorization": f"Bearer {create_access_token(str(user.id), role=role)}"}


async def _record(client, service_headers, **fields):
    body = {"provider": "kiri", "operation": "scan_3d", "status": "success", "cost_vnd": 0}
    body.update({k: str(v) if isinstance(v, uuid.UUID) else v for k, v in fields.items()})
    response = await client.post(
        "/api/v1/internal/api-cost/calls", headers=service_headers, json=body
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _set_budget(client, headers, amount, month=None):
    return await client.put(
        "/api/v1/admin/api-cost/budget",
        headers=headers,
        json={"month": (month or _today()).isoformat(), "budget_vnd": amount},
    )


async def _intake(client, service_headers, user_id=None):
    params = {"user_id": str(user_id)} if user_id else {}
    response = await client.get(
        "/api/v1/internal/api-cost/scan-intake", headers=service_headers, params=params
    )
    assert response.status_code == 200, response.text
    return response.json()


def _share(percent: int) -> int:
    return BUDGET_VND * percent // 100


@pytest.mark.asyncio
async def test_failed_calls_are_recorded_too(client, db, service_headers):
    admin = await _headers(db)
    day = _today()
    ok = await _record(client, service_headers, status="success", cost_vnd=12_000)
    failed = await _record(client, service_headers, status="failed", cost_vnd=3_000)
    assert ok["status"] == "success" and failed["status"] == "failed"
    rows = (
        await client.get(
            "/api/v1/admin/api-cost/daily",
            headers=admin,
            params={"date_from": day.isoformat(), "date_to": day.isoformat()},
        )
    ).json()
    assert rows == [
        {
            "day": day.isoformat(),
            "calls": 2,
            "success_calls": 1,
            "failed_calls": 1,
            "cost_vnd": 15_000,
        }
    ]
    stored = (await db.execute(text("SELECT count(*) FROM api_cost_entries"))).scalar_one()
    assert stored == 2


@pytest.mark.asyncio
async def test_occurred_on_uses_gmt7_business_day(client, db, service_headers):
    entry = await _record(
        client, service_headers, occurred_at="2026-09-21T18:30:00Z", cost_vnd=1
    )
    assert entry["occurred_on"] == "2026-09-22"
    before_midnight = await _record(
        client, service_headers, occurred_at="2026-09-21T16:59:59Z", cost_vnd=1
    )
    assert before_midnight["occurred_on"] == "2026-09-21"


@pytest.mark.asyncio
async def test_unconfigured_budget_never_suspends(client, db, service_headers, mock_budget_alert):
    admin = await _headers(db)
    await _record(client, service_headers, cost_vnd=BUDGET_VND * 50)
    status = (await client.get("/api/v1/admin/api-cost/budget", headers=admin)).json()
    assert status["state"] == "unconfigured"
    assert status["budget_vnd"] is None and status["percent"] is None
    assert status["spent_vnd"] == BUDGET_VND * 50
    assert await _intake(client, service_headers) == {
        "accepted": True, "reason": None, "message": None
    }
    mock_budget_alert.assert_not_called()


@pytest.mark.asyncio
async def test_warning_at_80_percent_fires_once(client, db, service_headers, mock_budget_alert):
    admin = await _headers(db)
    assert (await _set_budget(client, admin, BUDGET_VND)).json()["state"] == "ok"
    warn = settings.API_BUDGET_WARN_PERCENT

    # One đồng below the threshold: still "ok", no alert.
    await _record(client, service_headers, cost_vnd=_share(warn) - 1)
    mock_budget_alert.assert_not_called()
    await _record(client, service_headers, cost_vnd=1)

    status = (await client.get("/api/v1/admin/api-cost/budget", headers=admin)).json()
    assert status["state"] == "warning"
    assert status["percent"] == warn
    assert status["warned_at"] is not None
    assert status["suspended_at"] is None
    mock_budget_alert.assert_called_once()
    recipient, month, spent, budget, percent = mock_budget_alert.call_args.args
    assert recipient == (settings.API_COST_ADMIN_ALERT_EMAIL or settings.EMAIL_FROM)
    assert (month, spent, budget, percent) == (
        _today().replace(day=1).isoformat(), _share(warn), BUDGET_VND, warn
    )

    # Crossing again in the same period does not resend.
    await _record(client, service_headers, cost_vnd=1)
    await _record(client, service_headers, cost_vnd=1)
    mock_budget_alert.assert_called_once()
    again = (await client.get("/api/v1/admin/api-cost/budget", headers=admin)).json()
    assert again["warned_at"] == status["warned_at"]
    assert (await _intake(client, service_headers))["accepted"] is True


@pytest.mark.asyncio
async def test_suspend_at_100_percent_returns_msg43(client, db, service_headers, authenticated_user):
    from app.services import api_cost_service

    admin = await _headers(db)
    await _set_budget(client, admin, BUDGET_VND)
    await _record(client, service_headers, cost_vnd=_share(settings.API_BUDGET_SUSPEND_PERCENT) - 1)
    assert (await _intake(client, service_headers))["accepted"] is True  # boundary: 1đ short
    await api_cost_service.assert_scan_intake_available(db, authenticated_user)

    await _record(client, service_headers, cost_vnd=1, status="failed")  # failures count too
    status = (await client.get("/api/v1/admin/api-cost/budget", headers=admin)).json()
    assert status["state"] == "suspended"
    assert status["percent"] == settings.API_BUDGET_SUSPEND_PERCENT
    assert status["suspended_at"] is not None

    intake = await _intake(client, service_headers, authenticated_user.id)
    assert intake["accepted"] is False
    assert intake["reason"] == "budget_exhausted"
    assert intake["message"] == MSG43
    assert intake["message"] == ScanIntakeSuspended("budget_exhausted").message
    with pytest.raises(ScanIntakeSuspended) as refused:
        await api_cost_service.assert_scan_intake_available(db, authenticated_user)
    assert refused.value.status_code == 503
    assert refused.value.extra == {"reason": "budget_exhausted"}

    # Raising the budget re-opens intake and clears the suspension stamp.
    reopened = (await _set_budget(client, admin, BUDGET_VND * 2)).json()
    assert reopened["state"] == "ok" and reopened["suspended_at"] is None
    assert (await _intake(client, service_headers))["accepted"] is True


@pytest.mark.asyncio
async def test_suspension_does_not_touch_customer_quota(
    client, db, service_headers, auth_headers, authenticated_user
):
    from app.models.scan_credit import ScanCredit
    from app.repositories import plan_repo, subscription_repo
    from app.services import api_cost_service

    basic = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    subscription.plan_id = basic.id
    subscription.plan = basic
    subscription.tier = "basic_monthly"
    now = datetime.now(UTC)
    db.add(
        ScanCredit(
            user_id=authenticated_user.id,
            purchased_at=now,
            expires_at=now + timedelta(days=1),
            purchase_cycle_start=now,
            price_vnd=settings.CREDIT_PRICE_VND,
        )
    )
    await db.execute(
        text("UPDATE monthly_usage SET scans_used = 1 WHERE user_id = :uid"),
        {"uid": authenticated_user.id},
    )
    await db.commit()

    uid = authenticated_user.id

    async def snapshot():
        usage = (
            await db.execute(
                text("SELECT id, scans_used FROM monthly_usage WHERE user_id = :uid"),
                {"uid": uid},
            )
        ).all()
        credits = (
            await db.execute(
                text("SELECT id, status, consumed_at FROM scan_credits WHERE user_id = :uid"),
                {"uid": uid},
            )
        ).all()
        return usage, credits

    before = await snapshot()
    admin = await _headers(db)
    await _set_budget(client, admin, BUDGET_VND)
    await _record(client, service_headers, user_id=authenticated_user.id, cost_vnd=BUDGET_VND)
    assert (await _intake(client, service_headers, authenticated_user.id))["accepted"] is False
    with pytest.raises(ScanIntakeSuspended):
        await api_cost_service.assert_scan_intake_available(db, authenticated_user)
    # The gate refused the scan but deducted/reserved nothing (SRS_v2.2.txt:1767
    # "giữ nguyên lượt của khách").
    suspended = await snapshot()
    assert suspended == before
    assert suspended[0] and suspended[1]  # the rows exist, so the comparison is meaningful

    # Designing on a standard last and baking still work while intake is suspended.
    project = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Last"})
    assert project.status_code == 201
    project_id = project.json()["id"]
    saved = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": {"color": "red"}, "base_revision": 0},
    )
    assert saved.status_code == 200
    with patch("app.infrastructure.task_queue.enqueue_bake"):
        bake = await client.post(
            f"/api/v1/projects/{project_id}/bake",
            headers=service_headers,
            json={"design_config": {"color": "red"}},
        )
    assert bake.status_code == 202, bake.text

    # The project/bake path may open a usage row for its own period, but no scan is spent and
    # no Credit is consumed.
    usage_after, credits_after = await snapshot()
    assert credits_after == before[1]
    assert set(before[0]) <= set(usage_after)
    assert sum(row.scans_used for row in usage_after) == sum(row.scans_used for row in before[0])


@pytest.mark.asyncio
async def test_internal_account_scan_cap_of_ten(client, db, service_headers):
    from app.services import api_cost_service

    cap = settings.INTERNAL_ACCOUNT_SCAN_CAP
    internal = await _make_user(db, email="team@example.com", username="team", is_internal=True)
    customer = await _make_user(db, email="buyer@example.com", username="buyer")
    # Other operations never count towards the scan cap.
    await _record(client, service_headers, user_id=internal.id, operation="ai_texture")
    # Spread over two months: the cap is for the whole EXE201 period, not per month.
    old_month = (_today().replace(day=1) - timedelta(days=1)).isoformat() + "T05:00:00Z"
    for index in range(cap - 1):
        extra = {"occurred_at": old_month} if index == 0 else {}
        await _record(client, service_headers, user_id=internal.id, **extra)
        await _record(client, service_headers, user_id=customer.id)
    assert (await _intake(client, service_headers, internal.id))["accepted"] is True  # cap - 1
    await api_cost_service.assert_scan_intake_available(db, internal)

    await _record(client, service_headers, user_id=internal.id, status="failed")
    await _record(client, service_headers, user_id=customer.id)
    refused = await _intake(client, service_headers, internal.id)
    assert refused["accepted"] is False
    assert refused["reason"] == "internal_cap"
    with pytest.raises(ScanIntakeSuspended) as raised:
        await api_cost_service.assert_scan_intake_available(db, internal)
    assert raised.value.extra == {"reason": "internal_cap"}

    assert (await _intake(client, service_headers, customer.id))["accepted"] is True
    await api_cost_service.assert_scan_intake_available(db, customer)
    unknown = await client.get(
        "/api/v1/internal/api-cost/scan-intake",
        headers=service_headers,
        params={"user_id": str(uuid.uuid4())},
    )
    assert unknown.status_code == 404


@pytest.mark.asyncio
async def test_budget_upsert_requires_admin_write_and_audits(client, db):
    staff = await _headers(db, role="staff")
    admin = await _headers(db)
    denied = await _set_budget(client, staff, BUDGET_VND)
    assert denied.status_code == 403
    assert (await client.get("/api/v1/admin/api-cost/budget", headers=staff)).status_code == 200

    first = await _set_budget(client, admin, BUDGET_VND)
    second = await _set_budget(client, admin, BUDGET_VND * 2, month=_today().replace(day=1))
    assert first.status_code == 200 and second.status_code == 200
    assert second.json()["budget_vnd"] == BUDGET_VND * 2
    assert second.json()["period_month"] == _today().replace(day=1).isoformat()
    rows = (
        await db.execute(text("SELECT period_month, budget_vnd FROM api_budget_periods"))
    ).all()
    assert [(row.period_month, row.budget_vnd) for row in rows] == [
        (_today().replace(day=1), BUDGET_VND * 2)
    ]
    audits = (
        await db.execute(
            text("SELECT payload FROM audit_logs WHERE action = 'api_budget.update' ORDER BY created_at")
        )
    ).scalars().all()
    assert [a["previous_budget_vnd"] for a in audits] == [None, BUDGET_VND]
    negative = await _set_budget(client, admin, -1)
    assert negative.status_code == 422


@pytest.mark.asyncio
async def test_api_cost_csv_report_br108(client, db, service_headers):
    admin = await _headers(db)
    start = date(2026, 9, 1)
    await _record(client, service_headers, occurred_at="2026-09-01T03:00:00Z", cost_vnd=7_000)
    await _record(
        client, service_headers, occurred_at="2026-09-03T03:00:00Z", cost_vnd=2_000, status="failed"
    )
    await _record(client, service_headers, occurred_at="2026-09-03T04:00:00Z", cost_vnd=1_000)
    response = await client.get(
        "/api/v1/admin/reports/api-cost",
        headers=admin,
        params={"format": "csv", "date_from": start.isoformat(), "date_to": "2026-09-03"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    raw = response.content
    assert raw.startswith("﻿".encode())
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    assert rows[0] == ["Ngày", "Số lần gọi", "Thành công", "Thất bại", "Chi phí (VND)"]
    assert rows[1:] == [
        ["01/09/2026", "1", "1", "0", "7000"],
        ["02/09/2026", "0", "0", "0", "0"],
        ["03/09/2026", "2", "1", "1", "3000"],
        ["Tổng", "3", "2", "1", "10000"],
    ]
    for fmt in ("xlsx", "pdf"):
        other = await client.get(
            "/api/v1/admin/reports/api-cost", headers=admin, params={"format": fmt}
        )
        assert other.status_code == 200


@pytest.mark.asyncio
async def test_check_api_budget_task_is_registered_and_works(
    client, db, service_headers, mock_budget_alert
):
    import app.workers.tasks.api_cost_tasks as api_cost_tasks
    from app.repositories import api_cost_repo
    from app.workers.celery_app import celery_app

    name = "app.workers.tasks.api_cost_tasks.check_api_budget"
    assert name in celery_app.tasks
    assert celery_app.conf.beat_schedule["check-api-budget-daily"]["task"] == name

    # Seed spend and budget WITHOUT going through record_call, so no threshold was applied yet.
    now = datetime.now(UTC)
    month = _today().replace(day=1)
    await api_cost_repo.upsert_period(db, period_month=month, budget_vnd=BUDGET_VND, now=now)
    await api_cost_repo.create_entry(
        db, provider="kiri", operation="scan_3d", status="success",
        cost_vnd=_share(settings.API_BUDGET_WARN_PERCENT),
        occurred_on=_today(), occurred_at=now, created_at=now,
    )
    await db.commit()

    # Run the real Celery task body (asyncio.run inside) on its own thread, bound to this DB.
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    with patch.object(
        api_cost_tasks, "AsyncSessionLocal", async_sessionmaker(engine, expire_on_commit=False)
    ):
        warned = await asyncio.to_thread(api_cost_tasks.check_api_budget.run)
        assert warned == {"period_month": month.isoformat(), "state": "warning", "alerted": True}
        mock_budget_alert.assert_called_once()
        repeat = await asyncio.to_thread(api_cost_tasks.check_api_budget.run)
        assert repeat["alerted"] is False
        mock_budget_alert.assert_called_once()

        await api_cost_repo.create_entry(
            db, provider="kiri", operation="scan_3d", status="failed",
            cost_vnd=BUDGET_VND - _share(settings.API_BUDGET_WARN_PERCENT),
            occurred_on=_today(), occurred_at=now, created_at=now,
        )
        await db.commit()
        suspended = await asyncio.to_thread(api_cost_tasks.check_api_budget.run)
    await engine.dispose()
    assert suspended["state"] == "suspended"
    db.expire_all()
    stamps = (
        await db.execute(text("SELECT warned_at, suspended_at FROM api_budget_periods"))
    ).one()
    assert stamps.warned_at is not None and stamps.suspended_at is not None
    assert (await _intake(client, service_headers))["reason"] == "budget_exhausted"


@pytest.mark.asyncio
async def test_internal_api_cost_endpoints_require_service_token(client, db):
    body = {"provider": "kiri", "operation": "scan_3d", "status": "success", "cost_vnd": 1}
    for headers, expected in (({}, 422), ({"X-Service-Token": "wrong"}, 401)):
        post = await client.post("/api/v1/internal/api-cost/calls", headers=headers, json=body)
        get = await client.get("/api/v1/internal/api-cost/scan-intake", headers=headers)
        assert (post.status_code, get.status_code) == (expected, expected)
    stored = (await db.execute(text("SELECT count(*) FROM api_cost_entries"))).scalar_one()
    assert stored == 0


@pytest.mark.asyncio
async def test_bad_cost_payload_is_rejected(client, db, service_headers):
    base = {"provider": "kiri", "operation": "scan_3d", "status": "success", "cost_vnd": 1}
    for patch_fields in ({"cost_vnd": -1}, {"status": "timeout"}, {"provider": ""}):
        response = await client.post(
            "/api/v1/internal/api-cost/calls",
            headers=service_headers,
            json={**base, **patch_fields},
        )
        assert response.status_code == 422
    unknown_user = await client.post(
        "/api/v1/internal/api-cost/calls",
        headers=service_headers,
        json={**base, "user_id": str(uuid.uuid4())},
    )
    assert unknown_user.status_code == 404
    stored = (await db.execute(text("SELECT count(*) FROM api_cost_entries"))).scalar_one()
    assert stored == 0


@pytest.mark.asyncio
async def test_transactions_ledger_labels_credit_invoice(client, db, authenticated_user):
    """XR-1: a BR-94 Credit invoice prints as "Credit quét" in the BR-106 ledger, never a slug."""
    from app.models.invoice import Invoice
    from app.models.scan_credit import CREDIT_BILLING_CYCLE, CREDIT_INVOICE_TIER

    admin = await _headers(db)
    for order_code, tier, cycle in (
        (910001, CREDIT_INVOICE_TIER, CREDIT_BILLING_CYCLE),
        (910002, "basic", "monthly"),
    ):
        db.add(
            Invoice(
                user_id=authenticated_user.id,
                plan_tier=tier,
                billing_cycle=cycle,
                order_code=order_code,
                listed_price_vnd=settings.CREDIT_PRICE_VND,
                discount_vnd=0,
                amount_vnd=settings.CREDIT_PRICE_VND,
                payment_method="payos",
                status="paid",
                paid_at=datetime.now(UTC),
            )
        )
    await db.commit()
    response = await client.get(
        "/api/v1/admin/reports/transactions", headers=admin, params={"format": "csv"}
    )
    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    items = sorted(row[4] for row in rows[1:])
    assert items == ["Basic tháng", "Credit quét"]
