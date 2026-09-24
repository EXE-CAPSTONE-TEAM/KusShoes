"""Scan intake gates and the scan charge on the mobile scan flow.

The bootstrap call is where a Scan Job is accepted, so it enforces:
- SF-14 (SRS_v2.2.txt:1767): at API_BUDGET_SUSPEND_PERCENT of the month's budget no new Scan Job
  is accepted (MSG43), while the customer's own quota is left untouched.
- BR-23 / BR-94 (SRS_v2.2.txt:1617): a scan needs a plan scan left this cycle or an available
  Credit, otherwise MSG28.
Neither gate deducts. The scan is charged (plan scans first, then Credit, BR-23) when the compute
service confirms the output: POST /api/v1/internal/mobile/scans/output-confirm.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.infrastructure.storage import ObjectMetadata
from app.models.monthly_usage import MonthlyUsage
from app.models.project import Project
from app.models.scan_credit import ScanCredit
from app.repositories import plan_repo, subscription_repo
from app.services import quota_service
from app.utils.jwt import create_access_token

BOOTSTRAP = "/api/v1/mobile/scans/bootstrap"
INTERNAL = "/api/v1/internal/mobile"
COMPUTE_TOKEN = "compute-token"
BUDGET_VND = 1_000_000  # arbitrary test budget; only the percentage against it matters


@pytest.fixture(autouse=True)
def compute_configured(monkeypatch):
    # bootstrap refuses with MOBILE_COMPUTE_UNAVAILABLE before any gate when these are unset.
    monkeypatch.setattr(settings, "MOBILE_COMPUTE_URL", "http://compute.test")
    monkeypatch.setattr(settings, "MOBILE_COMPUTE_SERVICE_TOKEN", COMPUTE_TOKEN)


def _headers(user) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), role='user')}"}


async def _subscribe(db, user, tier: str) -> None:
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, "monthly")
    subscription = await subscription_repo.get_by_user(db, user.id)
    subscription.plan = plan
    subscription.tier = f"{tier}_monthly"
    subscription.status = "active"
    subscription.current_period_start = datetime.now(UTC) - timedelta(days=1)
    subscription.expires_at = subscription.current_period_start + timedelta(days=30)
    await db.commit()


async def _grant_credit(db, user) -> ScanCredit:
    now = datetime.now(UTC)
    subscription = await subscription_repo.get_by_user(db, user.id)
    credit = ScanCredit(
        user_id=user.id,
        invoice_id=None,
        purchased_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=30),
        purchase_cycle_start=quota_service.current_period_start(subscription),
        price_vnd=settings.CREDIT_PRICE_VND,
    )
    db.add(credit)
    await db.commit()
    return credit


async def _exhaust_budget(client, db, service_headers) -> None:
    from app.repositories import api_cost_repo
    from app.services.period_service import to_business_date

    now = datetime.now(UTC)
    month = to_business_date(now).replace(day=1)
    await api_cost_repo.upsert_period(db, period_month=month, budget_vnd=BUDGET_VND, now=now)
    await db.commit()
    response = await client.post(
        "/api/v1/internal/api-cost/calls",
        headers=service_headers,
        json={
            "provider": "kiri",
            "operation": "scan_3d",
            "status": "success",
            "cost_vnd": BUDGET_VND * settings.API_BUDGET_SUSPEND_PERCENT // 100,
        },
    )
    assert response.status_code == 201, response.text


async def _bootstrap(client, user, request_id=None):
    return await client.post(
        BOOTSTRAP,
        headers=_headers(user),
        json={"client_request_id": str(request_id or uuid.uuid4())},
    )


async def _projects(db, user) -> int:
    return await db.scalar(select(func.count()).select_from(Project).where(Project.user_id == user.id))


async def _scans_used(db, user) -> int:
    rows = (await db.execute(select(MonthlyUsage.scans_used).where(MonthlyUsage.user_id == user.id))).all()
    return sum(row[0] for row in rows)


@pytest.mark.asyncio
async def test_no_plan_scan_and_no_credit_is_refused_with_msg28(client, db, authenticated_user):
    # Free has no plan scans (plans.max_scans_per_cycle) and the user holds no Credit.
    response = await _bootstrap(client, authenticated_user)
    assert response.status_code == 409, response.text
    assert response.json()["code"] == "SCAN_QUOTA_EXHAUSTED"
    assert await _projects(db, authenticated_user) == 0  # refused before the project is created


@pytest.mark.asyncio
async def test_plan_scan_available_is_accepted_without_deducting(client, db, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    response = await _bootstrap(client, authenticated_user)
    assert response.status_code == 201, response.text
    assert await _projects(db, authenticated_user) == 1
    assert await _scans_used(db, authenticated_user) == 0  # the gate never charges


@pytest.mark.asyncio
async def test_available_credit_opens_intake_and_is_not_consumed(client, db, authenticated_user):
    credit = await _grant_credit(db, authenticated_user)  # Free plan: the Credit is the only scan
    response = await _bootstrap(client, authenticated_user)
    assert response.status_code == 201, response.text
    await db.refresh(credit)
    assert credit.status == "available"


@pytest.mark.asyncio
async def test_exhausted_budget_suspends_intake_with_msg43(
    client, db, service_headers, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    await _exhaust_budget(client, db, service_headers)
    response = await _bootstrap(client, authenticated_user)
    assert response.status_code == 503, response.text
    body = response.json()
    assert body["code"] == "SCAN_INTAKE_SUSPENDED"
    assert body["reason"] == "budget_exhausted"
    assert await _projects(db, authenticated_user) == 0
    assert await _scans_used(db, authenticated_user) == 0  # the customer's quota is kept


@pytest.mark.asyncio
async def test_replayed_request_keeps_its_grant_after_the_budget_runs_out(
    client, db, service_headers, authenticated_user
):
    await _subscribe(db, authenticated_user, "basic")
    request_id = uuid.uuid4()
    first = await _bootstrap(client, authenticated_user, request_id)
    assert first.status_code == 201, first.text

    await _exhaust_budget(client, db, service_headers)
    replay = await _bootstrap(client, authenticated_user, request_id)
    assert replay.status_code == 201, replay.text
    assert replay.json()["project_id"] == first.json()["project_id"]
    assert await _projects(db, authenticated_user) == 1


# ── Charging on completion ───────────────────────────────────────────────────


async def _start_scan(client, user) -> tuple[str, str]:
    """Bootstrap, then play the compute service: claim the grant and ask for the output upload.
    Returns (completion_token, asset_id)."""
    compute = {"X-Service-Token": COMPUTE_TOKEN}
    boot = await _bootstrap(client, user)
    assert boot.status_code == 201, boot.text
    claim = await client.post(
        f"{INTERNAL}/compute-grants/claim",
        headers=compute,
        json={"compute_grant": boot.json()["compute_grant"]},
    )
    assert claim.status_code == 200, claim.text
    completion_token = claim.json()["completion_token"]
    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://storage.test/upload",
    ):
        upload = await client.post(
            f"{INTERNAL}/scans/output-upload",
            headers=compute,
            json={"completion_token": completion_token},
        )
    assert upload.status_code == 200, upload.text
    return completion_token, upload.json()["asset_id"]


async def _finish_scan(client, completion_token: str, asset_id: str):
    with (
        patch(
            "app.infrastructure.storage.get_object_metadata",
            return_value=ObjectMetadata(size_bytes=1000, content_type="model/gltf-binary"),
        ),
        patch("app.infrastructure.storage.read_object_prefix", return_value=b"glTF"),
    ):
        return await client.post(
            f"{INTERNAL}/scans/output-confirm",
            headers={"X-Service-Token": COMPUTE_TOKEN},
            json={"completion_token": completion_token, "asset_id": asset_id, "file_size_bytes": 1000},
        )


@pytest.mark.asyncio
async def test_finished_scan_spends_the_plan_scan_and_closes_intake(client, db, authenticated_user):
    await _subscribe(db, authenticated_user, "basic")
    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    for _ in range(plan.max_scans_per_cycle):
        token, asset_id = await _start_scan(client, authenticated_user)
        done = await _finish_scan(client, token, asset_id)
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "raw"
    assert await _scans_used(db, authenticated_user) == plan.max_scans_per_cycle

    refused = await _bootstrap(client, authenticated_user)
    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "SCAN_QUOTA_EXHAUSTED"


@pytest.mark.asyncio
async def test_finished_scan_spends_a_credit_when_no_plan_scan_is_left(
    client, db, authenticated_user
):
    credit = await _grant_credit(db, authenticated_user)  # Free: no plan scans
    token, asset_id = await _start_scan(client, authenticated_user)
    done = await _finish_scan(client, token, asset_id)
    assert done.status_code == 200, done.text
    await db.refresh(credit)
    assert credit.status == "used"
    assert await _scans_used(db, authenticated_user) == 0  # plan side untouched

    refused = await _bootstrap(client, authenticated_user)
    assert refused.status_code == 409
    assert refused.json()["code"] == "SCAN_QUOTA_EXHAUSTED"


@pytest.mark.asyncio
async def test_replayed_completion_is_charged_once(client, db, authenticated_user):
    await _subscribe(db, authenticated_user, "pro")
    token, asset_id = await _start_scan(client, authenticated_user)
    first = await _finish_scan(client, token, asset_id)
    replay = await _finish_scan(client, token, asset_id)
    assert first.status_code == replay.status_code == 200
    assert await _scans_used(db, authenticated_user) == 1


@pytest.mark.asyncio
async def test_scans_accepted_together_are_both_delivered_and_charged_at_most_once_each(
    client, db, authenticated_user
):
    # No reservation at intake (BR-35 is out of scope): with one plan scan left, two scans can
    # both pass the gate. The late one is delivered uncharged rather than losing its output.
    await _subscribe(db, authenticated_user, "basic")
    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    assert plan.max_scans_per_cycle == 1, "this race needs exactly one plan scan"
    first = await _start_scan(client, authenticated_user)
    second = await _start_scan(client, authenticated_user)
    assert (await _finish_scan(client, *first)).status_code == 200
    late = await _finish_scan(client, *second)
    assert late.status_code == 200, late.text
    assert late.json()["status"] == "raw"
    assert await _scans_used(db, authenticated_user) == 1


# ── GRACE (BR-90, SRS_v2.2.txt:1582: "không quét") ──────────────────────────


async def _enter_grace(db, user) -> None:
    subscription = await subscription_repo.get_by_user(db, user.id)
    subscription.status = "grace"
    await db.commit()


@pytest.mark.asyncio
async def test_grace_subscription_cannot_start_a_scan(client, db, authenticated_user):
    await _subscribe(db, authenticated_user, "pro")  # plan scans left
    await _grant_credit(db, authenticated_user)  # and a Credit
    await _enter_grace(db, authenticated_user)
    response = await _bootstrap(client, authenticated_user)
    assert response.status_code == 403, response.text
    assert response.json()["code"] == "SUB_GRACE_SCAN_BLOCKED"
    assert await _projects(db, authenticated_user) == 0


@pytest.mark.asyncio
async def test_scan_accepted_before_grace_is_still_delivered_and_charged(
    client, db, authenticated_user
):
    await _subscribe(db, authenticated_user, "pro")
    token, asset_id = await _start_scan(client, authenticated_user)
    await _enter_grace(db, authenticated_user)
    done = await _finish_scan(client, token, asset_id)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "raw"
    assert await _scans_used(db, authenticated_user) == 1


@pytest.mark.asyncio
async def test_concurrent_completion_is_refused_and_never_double_charged(
    client, db, redis, authenticated_user
):
    import hashlib

    from app.services.mobile_service import LOCK_PREFIX

    await _subscribe(db, authenticated_user, "pro")
    token, asset_id = await _start_scan(client, authenticated_user)
    lock_key = f"{LOCK_PREFIX}:confirm:{hashlib.sha256(token.encode()).hexdigest()}"
    await redis.set(lock_key, "1")  # another confirm of this scan is in flight
    try:
        busy = await _finish_scan(client, token, asset_id)
        assert busy.status_code == 409, busy.text
        assert busy.json()["code"] == "MOBILE_SCAN_PUBLISH_CONFLICT"
        assert await _scans_used(db, authenticated_user) == 0
    finally:
        await redis.delete(lock_key)

    done = await _finish_scan(client, token, asset_id)
    assert done.status_code == 200, done.text
    assert await _scans_used(db, authenticated_user) == 1
