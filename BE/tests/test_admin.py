from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest

from app.utils.jwt import create_access_token, create_raw_refresh_token, hash_token


async def _make_role_user(db, role: str, email: str, username: str):
    from app.repositories import user_repo

    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name=role.title(),
        last_name="User",
        role=role,
    )
    user.is_verified = True
    await db.commit()
    return user


async def _admin_headers(db):
    admin = await _make_role_user(db, "admin", "admin@example.com", "adminuser")
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}


async def _staff_headers(db):
    staff = await _make_role_user(db, "staff", "staff@example.com", "staffuser")
    return {"Authorization": f"Bearer {create_access_token(str(staff.id), role='staff')}"}


async def _make_refresh_token(db, user):
    from app.repositories import refresh_token_repo

    raw_token = create_raw_refresh_token()
    await refresh_token_repo.create(
        db,
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    await db.commit()
    return raw_token


# --- RBAC ---


@pytest.mark.asyncio
async def test_user_token_rejected_on_admin_endpoints(client, auth_headers):
    response = await client.get("/api/v1/admin/dashboard/stats", headers=auth_headers)
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_staff_can_read_but_not_write(client, db, authenticated_user):
    staff_headers = await _staff_headers(db)

    read = await client.get("/api/v1/admin/dashboard/stats", headers=staff_headers)
    assert read.status_code == 200

    write = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/ban",
        headers=staff_headers,
        json={},
    )
    assert write.status_code == 403
    assert write.json()["code"] == "ADMIN_FORBIDDEN"


# --- Admin auth ---


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "staff"])
async def test_admin_and_staff_logout_revoke_refresh_token(client, db, role):
    actor = await _make_role_user(
        db, role, f"{role}-logout@example.com", f"{role}logout"
    )
    headers = {
        "Authorization": f"Bearer {create_access_token(str(actor.id), role=role)}"
    }
    refresh_token = await _make_refresh_token(db, actor)

    response = await client.post(
        "/api/v1/admin/auth/logout",
        headers=headers,
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Đăng xuất thành công"}

    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert refresh.status_code == 401
    assert refresh.json()["code"] == "AUTH_REFRESH_INVALID"


@pytest.mark.asyncio
async def test_admin_logout_rejects_other_actor_and_revoked_token(client, db):
    actor_a = await _make_role_user(db, "admin", "actor-a@example.com", "actora")
    actor_b = await _make_role_user(db, "staff", "actor-b@example.com", "actorb")
    headers_a = {
        "Authorization": f"Bearer {create_access_token(str(actor_a.id), role='admin')}"
    }
    headers_b = {
        "Authorization": f"Bearer {create_access_token(str(actor_b.id), role='staff')}"
    }
    refresh_token = await _make_refresh_token(db, actor_b)

    wrong_actor = await client.post(
        "/api/v1/admin/auth/logout",
        headers=headers_a,
        json={"refresh_token": refresh_token},
    )
    assert wrong_actor.status_code == 401
    assert wrong_actor.json()["code"] == "AUTH_REFRESH_INVALID"

    first_logout = await client.post(
        "/api/v1/admin/auth/logout",
        headers=headers_b,
        json={"refresh_token": refresh_token},
    )
    assert first_logout.status_code == 200

    repeated_logout = await client.post(
        "/api/v1/admin/auth/logout",
        headers=headers_b,
        json={"refresh_token": refresh_token},
    )
    assert repeated_logout.status_code == 401
    assert repeated_logout.json()["code"] == "AUTH_REFRESH_INVALID"

    used_token = await _make_refresh_token(db, actor_a)
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": used_token}
    )
    assert refreshed.status_code == 200
    used_logout = await client.post(
        "/api/v1/admin/auth/logout",
        headers=headers_a,
        json={"refresh_token": used_token},
    )
    assert used_logout.status_code == 401
    assert used_logout.json()["code"] == "AUTH_REFRESH_INVALID"


@pytest.mark.asyncio
async def test_regular_user_cannot_use_admin_logout(
    client, db, authenticated_user, auth_headers
):
    refresh_token = await _make_refresh_token(db, authenticated_user)
    response = await client.post(
        "/api/v1/admin/auth/logout",
        headers=auth_headers,
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 403


# --- Dashboard ---


@pytest.mark.asyncio
async def test_dashboard_stats_and_series(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)

    stats = await client.get("/api/v1/admin/dashboard/stats", headers=admin_headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["total_users"] >= 1
    assert body["mrr_vnd"] == 0  # chỉ có free subscription

    revenue = await client.get("/api/v1/admin/dashboard/revenue", headers=admin_headers)
    assert revenue.status_code == 200
    assert len(revenue.json()) == 12
    assert all(point["value"] == 0 for point in revenue.json())

    growth = await client.get("/api/v1/admin/dashboard/user-growth", headers=admin_headers)
    assert growth.status_code == 200
    assert len(growth.json()) == 6
    assert growth.json()[-1]["value"] >= 1  # user vừa tạo trong tháng này

    recent = await client.get("/api/v1/admin/dashboard/recent-users", headers=admin_headers)
    assert recent.status_code == 200
    emails = [u["email"] for u in recent.json()]
    assert authenticated_user.email in emails


# --- User management ---


@pytest.mark.asyncio
async def test_user_list_search_and_detail(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)

    listing = await client.get("/api/v1/admin/users?q=profile", headers=admin_headers)
    assert listing.status_code == 200
    assert any(u["email"] == authenticated_user.email for u in listing.json())

    detail = await client.get(
        f"/api/v1/admin/users/{authenticated_user.id}", headers=admin_headers
    )
    assert detail.status_code == 200
    body = detail.json()
    assert body["subscription_tier"] == "free"
    assert body["total_projects"] == 0


@pytest.mark.asyncio
async def test_ban_unban_flow(client, db, authenticated_user, auth_headers):
    admin_headers = await _admin_headers(db)

    ban = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/ban",
        headers=admin_headers,
        json={"reason": "spam"},
    )
    assert ban.status_code == 200

    blocked = await client.get("/api/v1/users/me", headers=auth_headers)
    assert blocked.status_code == 403

    unban = await client.post(
        f"/api/v1/admin/users/{authenticated_user.id}/unban", headers=admin_headers
    )
    assert unban.status_code == 200

    restored = await client.get("/api/v1/users/me", headers=auth_headers)
    assert restored.status_code == 200

    logs = await client.get("/api/v1/admin/audit-logs?action=user.ban", headers=admin_headers)
    assert logs.status_code == 200
    assert len(logs.json()) == 1
    assert logs.json()[0]["payload"] == {"reason": "spam"}


@pytest.mark.asyncio
async def test_cannot_ban_privileged_or_self(client, db):
    admin_headers = await _admin_headers(db)
    staff = await _make_role_user(db, "staff", "staff2@example.com", "staffuser2")

    response = await client.post(
        f"/api/v1/admin/users/{staff.id}/ban", headers=admin_headers, json={}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "ADMIN_CANNOT_MODIFY_PRIVILEGED"


@pytest.mark.asyncio
async def test_create_staff_and_login(client, db):
    admin_headers = await _admin_headers(db)

    created = await client.post(
        "/api/v1/admin/staff",
        headers=admin_headers,
        json={
            "email": "newstaff@example.com",
            "username": "newstaff",
            "password": "Password123",
            "first_name": "New",
            "last_name": "Staff",
        },
    )
    assert created.status_code == 201
    assert created.json()["role"] == "staff"

    login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "newstaff@example.com", "password": "Password123"},
    )
    assert login.status_code == 200

    duplicate = await client.post(
        "/api/v1/admin/staff",
        headers=admin_headers,
        json={
            "email": "newstaff@example.com",
            "username": "otherstaff",
            "password": "Password123",
            "first_name": "New",
            "last_name": "Staff",
        },
    )
    assert duplicate.status_code == 409


# --- Plans ---


@pytest.mark.asyncio
async def test_plan_update_and_validation(client, db):
    admin_headers = await _admin_headers(db)

    plans = await client.get("/api/v1/admin/plans", headers=admin_headers)
    assert plans.status_code == 200
    creator = next(
        p for p in plans.json() if p["tier"] == "creator" and p["billing_cycle"] == "monthly"
    )

    original_price = creator["price_vnd"]
    updated = await client.patch(
        f"/api/v1/admin/plans/{creator['id']}",
        headers=admin_headers,
        json={"price_vnd": original_price + 1000},
    )
    assert updated.status_code == 200
    assert updated.json()["price_vnd"] == original_price + 1000

    public = await client.get("/api/v1/plans")
    public_creator = next(
        p for p in public.json() if p["tier"] == "creator" and p["billing_cycle"] == "monthly"
    )
    assert public_creator["price_vnd"] == original_price + 1000

    invalid = await client.patch(
        f"/api/v1/admin/plans/{creator['id']}",
        headers=admin_headers,
        json={"bake_priority": "urgent"},
    )
    assert invalid.status_code == 422

    # restore để không leak sang test khác
    await client.patch(
        f"/api/v1/admin/plans/{creator['id']}",
        headers=admin_headers,
        json={"price_vnd": original_price},
    )


# --- Refund ---


@pytest.mark.asyncio
async def test_refund_paid_polar_invoice(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    from app.repositories import invoice_repo, plan_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "creator", "monthly")
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
        payment_method="polar",
        gateway_transaction_id="checkout_refund_test",
    )
    await invoice_repo.mark_paid(
        db, invoice, paid_at=datetime.now(UTC),
        gateway_metadata_patch={"polar_order_id": "order_refund_test"},
    )
    await db.commit()

    with patch(
        "app.infrastructure.polar_client.create_refund",
        new=AsyncMock(return_value="refund_123"),
    ):
        response = await client.post(
            f"/api/v1/admin/billing/invoices/{invoice.id}/refund", headers=admin_headers
        )
    assert response.status_code == 200
    assert response.json()["polar_refund_id"] == "refund_123"

    # DB status vẫn 'paid' — webhook mới là write path
    await db.refresh(invoice)
    assert invoice.status == "paid"
    assert invoice.gateway_metadata["polar_refund_id"] == "refund_123"


@pytest.mark.asyncio
async def test_refund_pending_invoice_rejected(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    from app.repositories import invoice_repo, plan_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "creator", "monthly")
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
        payment_method="polar",
    )
    await db.commit()

    response = await client.post(
        f"/api/v1/admin/billing/invoices/{invoice.id}/refund", headers=admin_headers
    )
    assert response.status_code == 409
    assert response.json()["code"] == "INVOICE_NOT_REFUNDABLE"


# --- Bake jobs ---


async def _make_bake_job(db, user_id, status):
    from app.repositories import bake_job_repo, project_repo

    project = await project_repo.create(db, user_id=user_id, name="Bake test", description=None)
    job = await bake_job_repo.create(
        db, project_id=project.id, design_config={"color": "red"}, priority="low"
    )
    job.status = status
    await db.commit()
    return job


@pytest.mark.asyncio
async def test_requeue_failed_bake_job(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    job = await _make_bake_job(db, authenticated_user.id, "failed")

    with patch("app.infrastructure.task_queue.enqueue_bake") as mock_enqueue:
        response = await client.post(
            f"/api/v1/admin/bake-jobs/{job.id}/requeue", headers=admin_headers
        )
    assert response.status_code == 200
    mock_enqueue.assert_called_once_with(str(job.id), "low")

    await db.refresh(job)
    assert job.status == "queued"
    assert job.error_message is None


@pytest.mark.asyncio
async def test_requeue_completed_job_rejected(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    job = await _make_bake_job(db, authenticated_user.id, "completed")

    response = await client.post(
        f"/api/v1/admin/bake-jobs/{job.id}/requeue", headers=admin_headers
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_cancel_queued_job_and_worker_ignores_it(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    job = await _make_bake_job(db, authenticated_user.id, "queued")

    response = await client.post(
        f"/api/v1/admin/bake-jobs/{job.id}/cancel", headers=admin_headers
    )
    assert response.status_code == 200
    await db.refresh(job)
    assert job.status == "cancelled"

    from app.services import bake_service

    result = await bake_service.process_bake(db, job.id, worker_id=None)
    assert result["status"] == "ignored"
    assert result["reason"] == "status_cancelled"


@pytest.mark.asyncio
async def test_cancel_processing_job_rejected(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    job = await _make_bake_job(db, authenticated_user.id, "processing")

    response = await client.post(
        f"/api/v1/admin/bake-jobs/{job.id}/cancel", headers=admin_headers
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_admin_lists_include_display_fields(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    from app.repositories import (
        bake_job_repo,
        export_record_repo,
        invoice_repo,
        plan_repo,
        project_repo,
    )

    project = await project_repo.create(
        db,
        user_id=authenticated_user.id,
        name="Display field project",
        description=None,
    )
    job = await bake_job_repo.create(
        db, project_id=project.id, design_config={"material": "leather"}, priority="normal"
    )
    export = (
        await export_record_repo.create_many(
            db,
            project_id=project.id,
            bake_job_id=job.id,
            user_id=authenticated_user.id,
            exports=[{"format": "glb", "file_path": "exports/display.glb"}],
        )
    )[0]
    plan = await plan_repo.get_by_tier_and_cycle(db, "creator", "monthly")
    invoice = await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
        gateway_metadata={"polar_order_id": "polar-display-order"},
    )
    await db.commit()

    subscriptions = await client.get(
        "/api/v1/admin/billing/subscriptions", headers=admin_headers
    )
    subscription = next(
        item for item in subscriptions.json() if item["user_id"] == str(authenticated_user.id)
    )
    assert subscription["user_email"] == authenticated_user.email

    invoices = await client.get("/api/v1/admin/billing/invoices", headers=admin_headers)
    invoice_body = next(item for item in invoices.json() if item["id"] == str(invoice.id))
    assert invoice_body["user_email"] == authenticated_user.email
    assert invoice_body["polar_order_id"] == "polar-display-order"

    projects = await client.get("/api/v1/admin/projects", headers=admin_headers)
    project_body = next(item for item in projects.json() if item["id"] == str(project.id))
    assert project_body["owner_email"] == authenticated_user.email

    jobs = await client.get("/api/v1/admin/bake-jobs", headers=admin_headers)
    job_body = next(item for item in jobs.json() if item["id"] == str(job.id))
    assert job_body["project_name"] == project.name

    job_detail = await client.get(
        f"/api/v1/admin/bake-jobs/{job.id}", headers=admin_headers
    )
    assert job_detail.json()["project_name"] == project.name

    exports = await client.get("/api/v1/admin/exports", headers=admin_headers)
    export_body = next(item for item in exports.json() if item["id"] == str(export.id))
    assert export_body["project_name"] == project.name
    assert export_body["user_email"] == authenticated_user.email


@pytest.mark.asyncio
async def test_admin_display_lists_use_constant_query_count(db, authenticated_user):
    from app.repositories import (
        audit_log_repo,
        bake_job_repo,
        export_record_repo,
        invoice_repo,
        plan_repo,
        project_repo,
    )
    from app.services import admin_service, billing_service

    admin = await _make_role_user(db, "admin", "query-count@example.com", "querycount")
    project = await project_repo.create(
        db, user_id=authenticated_user.id, name="Query count", description=None
    )
    job = await bake_job_repo.create(
        db, project_id=project.id, design_config={"color": "black"}, priority="low"
    )
    await export_record_repo.create_many(
        db,
        project_id=project.id,
        bake_job_id=job.id,
        user_id=authenticated_user.id,
        exports=[{"format": "glb", "file_path": "exports/query-count.glb"}],
    )
    plan = await plan_repo.get_by_tier_and_cycle(db, "creator", "monthly")
    await invoice_repo.create_pending(
        db,
        user_id=authenticated_user.id,
        plan_id=plan.id,
        plan_tier="creator",
        billing_cycle="monthly",
        amount_vnd=plan.price_vnd,
    )
    await audit_log_repo.create(
        db, actor_id=admin.id, actor_role="admin", action="query.count"
    )
    await db.commit()

    calls = [
        lambda: billing_service.admin_list_subscriptions(
            db, tier=None, status=None, limit=20, before=None
        ),
        lambda: billing_service.admin_list_invoices(
            db, status=None, user_id=None, limit=20, before=None
        ),
        lambda: admin_service.list_projects_admin(db, limit=20),
        lambda: admin_service.list_bake_jobs(db, limit=20),
        lambda: admin_service.get_bake_job(db, job.id),
        lambda: admin_service.list_exports_admin(db, limit=20),
        lambda: admin_service.list_audit_logs(db, limit=20),
    ]
    for call in calls:
        with patch.object(db, "execute", wraps=db.execute) as execute:
            await call()
        assert execute.await_count == 1


# --- Projects oversight ---


@pytest.mark.asyncio
async def test_admin_project_delete_and_visibility(client, db, authenticated_user):
    admin_headers = await _admin_headers(db)
    from app.repositories import project_repo

    project = await project_repo.create(
        db, user_id=authenticated_user.id, name="To delete", description=None
    )
    await db.commit()

    with patch("app.infrastructure.task_queue.enqueue_project_cleanup") as mock_cleanup:
        deleted = await client.delete(
            f"/api/v1/admin/projects/{project.id}", headers=admin_headers
        )
    assert deleted.status_code == 200
    mock_cleanup.assert_called_once()

    default_list = await client.get("/api/v1/admin/projects", headers=admin_headers)
    assert all(p["id"] != str(project.id) for p in default_list.json())

    with_deleted = await client.get(
        "/api/v1/admin/projects?include_deleted=true", headers=admin_headers
    )
    assert any(p["id"] == str(project.id) for p in with_deleted.json())


# --- Audit logs RBAC ---


@pytest.mark.asyncio
async def test_audit_logs_staff_forbidden(client, db):
    staff_headers = await _staff_headers(db)
    response = await client.get("/api/v1/admin/audit-logs", headers=staff_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_audit_log_search_and_display_email(client, db):
    from app.repositories import audit_log_repo

    admin = await _make_role_user(db, "admin", "audit.actor@example.com", "auditactor")
    headers = {
        "Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"
    }
    target_id = "8c9c0611-67d7-4d84-9bd5-b9053aab319d"
    await audit_log_repo.create(
        db,
        actor_id=admin.id,
        actor_role="admin",
        action="project.delete",
        target_type="project",
        target_id=target_id,
    )
    await audit_log_repo.create(
        db,
        actor_id=admin.id,
        actor_role="admin",
        action="user.ban",
        target_type="user",
        target_id="bfa1fd08-d38b-4cc5-b641-74d69addcfbf",
    )
    await db.commit()

    for q in ("AUDIT.ACTOR@EXAMPLE.COM", "PROJECT.DELETE", "PROJECT", target_id.upper()):
        response = await client.get(
            "/api/v1/admin/audit-logs", params={"q": q}, headers=headers
        )
        assert response.status_code == 200
        assert any(item["target_id"] == target_id for item in response.json())
        assert response.json()[0]["actor_email"] == admin.email

    combined = await client.get(
        "/api/v1/admin/audit-logs",
        params={"q": "  PROJECT  ", "action": "project.delete"},
        headers=headers,
    )
    assert combined.status_code == 200
    assert [item["action"] for item in combined.json()] == ["project.delete"]

    empty = await client.get(
        "/api/v1/admin/audit-logs", params={"q": "   "}, headers=headers
    )
    assert empty.status_code == 200
    assert len(empty.json()) == 2


@pytest.mark.asyncio
async def test_admin_query_validation_and_openapi(client, db):
    admin_headers = await _admin_headers(db)

    invalid_cases = [
        ("/api/v1/admin/users", {"limit": 0}),
        ("/api/v1/admin/users", {"limit": 101}),
        ("/api/v1/admin/users", {"role": "owner"}),
        ("/api/v1/admin/users", {"status": "disabled"}),
        ("/api/v1/admin/billing/subscriptions", {"tier": "enterprise"}),
        ("/api/v1/admin/billing/subscriptions", {"status": "pending"}),
        ("/api/v1/admin/billing/invoices", {"status": "unknown"}),
        ("/api/v1/admin/projects", {"status": "unknown"}),
        ("/api/v1/admin/bake-jobs", {"status": "waiting"}),
        ("/api/v1/admin/bake-jobs", {"priority": "urgent"}),
        ("/api/v1/admin/exports", {"format": "fbx"}),
        ("/api/v1/admin/audit-logs", {"q": "x" * 201}),
        ("/api/v1/admin/audit-logs", {"actor_id": "not-a-uuid"}),
        ("/api/v1/admin/audit-logs", {"before": "not-a-date"}),
    ]
    for path, params in invalid_cases:
        response = await client.get(path, params=params, headers=admin_headers)
        assert response.status_code == 422, (path, params, response.text)

    openapi = (await client.get("/openapi.json")).json()
    schemas = openapi["components"]["schemas"]
    expected_fields = {
        "AdminSubscriptionResponse": {"user_email"},
        "AdminInvoiceResponse": {"user_email", "polar_order_id"},
        "AdminProjectListItem": {"owner_email"},
        "AdminBakeJobResponse": {"project_name"},
        "AdminBakeJobDetailResponse": {"project_name"},
        "AdminExportRecordResponse": {"project_name", "user_email"},
        "AuditLogResponse": {"actor_email"},
    }
    for schema_name, fields in expected_fields.items():
        properties = schemas[schema_name]["properties"]
        assert fields <= properties.keys()
        for field in fields:
            assert {item.get("type") for item in properties[field]["anyOf"]} >= {
                "string",
                "null",
            }


# --- System health ---


@pytest.mark.asyncio
async def test_system_health(client, db):
    admin_headers = await _admin_headers(db)
    with patch("app.infrastructure.storage.health_check"):
        response = await client.get("/api/v1/admin/system/health", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["checks"]["db"] == "ok"
    assert "queue_depths" in body
