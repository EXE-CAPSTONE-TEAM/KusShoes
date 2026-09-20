from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest


async def _create_project(client, headers, name="My Shoe"):
    return await client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": name, "description": "Custom design"},
    )


async def _upgrade_to_basic(db, user_id):
    from app.repositories import plan_repo, subscription_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    subscription = await subscription_repo.get_by_user(db, user_id)
    subscription.plan_id = plan.id
    subscription.tier = "basic_monthly"
    subscription.status = "active"
    subscription.expires_at = datetime.now(UTC) + timedelta(days=20)
    await db.commit()
    return subscription, plan


@pytest.mark.asyncio
async def test_save_design_rejects_over_layer_limit(client, service_headers, auth_headers):
    project_id = (await _create_project(client, auth_headers)).json()["id"]
    # Free plan caps at 30 layers/project (§3.2.8) — 31 stickers must be rejected.
    design_config = {"stickers": [{"id": str(i), "type": "image"} for i in range(31)]}
    response = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": design_config},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "DESIGN_LAYER_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_save_design_within_layer_limit_succeeds(client, service_headers, auth_headers):
    project_id = (await _create_project(client, auth_headers)).json()["id"]
    design_config = {
        "stickers": [{"id": str(i), "type": "image"} for i in range(10)],
        "texts": [{"id": "t1", "value": "hi"}],
    }
    response = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": design_config},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_locked_project_blocks_edit_and_delete(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import project_repo

    project_id = (await _create_project(client, auth_headers)).json()["id"]
    project = await project_repo.get_by_id(db, project_id)
    project.is_locked = True
    await db.commit()

    update = await client.patch(
        f"/api/v1/projects/{project_id}", headers=auth_headers, json={"name": "New name"}
    )
    assert update.status_code == 403
    assert update.json()["code"] == "PROJECT_LOCKED"

    delete = await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert delete.status_code == 403
    assert delete.json()["code"] == "PROJECT_LOCKED"

    # Reading a locked project is still allowed (BR-27: view-only, not hidden).
    read = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert read.status_code == 200


@pytest.mark.asyncio
async def test_grace_period_blocks_export(
    client, db, service_headers, auth_headers, authenticated_user
):
    subscription, _plan = await _upgrade_to_basic(db, authenticated_user.id)
    subscription.status = "grace"
    subscription.grace_until = datetime.now(UTC) + timedelta(days=2)
    await db.commit()

    project_id = (await _create_project(client, auth_headers)).json()["id"]
    response = await client.post(
        f"/api/v1/projects/{project_id}/bake",
        headers=service_headers,
        json={"design_config": {"color": "red"}},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "SUB_GRACE_EXPORT_BLOCKED"


@pytest.mark.asyncio
async def test_maintenance_enters_grace_then_downgrades_and_locks_excess_projects(
    client, db, auth_headers, authenticated_user
):
    from app.repositories import project_repo
    from app.services import maintenance_service

    subscription, plan = await _upgrade_to_basic(db, authenticated_user.id)
    subscription.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()

    with patch("app.infrastructure.task_queue.enqueue_grace_period_email"):
        result = await maintenance_service.enter_grace_period(db)
    assert result["entered_grace"] == 1
    await db.refresh(subscription)
    assert subscription.status == "grace"
    assert subscription.grace_until is not None

    # Create 5 projects while still on Basic (max_projects=20) so the drop to
    # Free (max_projects=3) leaves 2 excess projects to lock.
    for index in range(5):
        assert (await _create_project(client, auth_headers, f"Shoe {index}")).status_code == 201

    subscription.grace_until = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()

    result = await maintenance_service.finalize_grace_expiry(db)
    assert result["downgraded"] == 1
    assert result["locked"] == 2

    await db.refresh(subscription)
    assert subscription.tier == "free"
    assert subscription.status == "active"

    projects = await project_repo.list_for_user(db, authenticated_user.id, 10, None)
    locked_count = sum(1 for p in projects if p.is_locked)
    assert locked_count == 2
    # Most-recently-updated projects stay editable.
    assert not projects[0].is_locked


@pytest.mark.asyncio
async def test_upgrade_checkout_applies_proration(client, db, auth_headers, authenticated_user):
    from unittest.mock import AsyncMock

    await _upgrade_to_basic(db, authenticated_user.id)

    with patch(
        "app.infrastructure.payos_client.create_payment_link",
        new=AsyncMock(return_value=("https://pay.payos.vn/web/upgrade", "link_upgrade")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=auth_headers,
            json={"tier": "pro", "billing_cycle": "monthly", "gateway": "payos"},
        )
    assert response.status_code == 200

    from app.repositories import invoice_repo

    invoices = await invoice_repo.list_by_user(db, authenticated_user.id, limit=10)
    invoice = invoices[0]
    assert invoice.listed_price_vnd == 649_000
    assert invoice.discount_vnd > 0
    assert invoice.amount_vnd == invoice.listed_price_vnd - invoice.discount_vnd
    assert invoice.amount_vnd < invoice.listed_price_vnd
