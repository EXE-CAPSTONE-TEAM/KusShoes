"""C1 — BR-77 three-level ladder / UC-24 copyright complaints (SRS_v2.2.txt:2042, :194)."""

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
from sqlalchemy import text

from app.config import settings
from app.utils.jwt import create_access_token

DETAILS = "Thiết kế này dùng logo đã đăng ký bảo hộ của chúng tôi mà không xin phép."
NOTE = "Đã xác minh bằng chứng"


async def _make_user(db, *, email, username, role="user"):
    from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo

    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Test",
        last_name=role.title(),
        role=role,
    )
    user.is_verified = True
    plan = await plan_repo.get_free_plan(db)
    await subscription_repo.create_free(db, user_id=user.id, plan_id=plan.id)
    await monthly_usage_repo.create_for_user(db, user_id=user.id, period_start=datetime.now(UTC))
    await db.commit()
    return user


def _headers(user) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), role=user.role)}"}


async def _admin(db, role="admin"):
    user = await _make_user(db, email=f"{role}-mod@example.com", username=f"{role}mod", role=role)
    return user, _headers(user)


async def _upgrade(db, user_id, tier="basic"):
    from app.repositories import plan_repo, subscription_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, tier, "monthly")
    subscription = await subscription_repo.get_by_user(db, user_id)
    subscription.plan_id = plan.id
    subscription.plan = plan
    subscription.tier = f"{tier}_monthly"
    subscription.status = "active"
    subscription.expires_at = datetime.now(UTC) + timedelta(days=20)
    await db.commit()


async def _create_project(client, headers, name="Reported Shoe"):
    response = await client.post("/api/v1/projects", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _seed_export(db, project_id, user_id):
    from app.repositories import bake_job_repo, export_record_repo

    job = await bake_job_repo.create(db, project_id=project_id, design_config={}, priority="low")
    bake_job_repo.mark_completed(job)
    records = await export_record_repo.create_many(
        db,
        project_id=project_id,
        bake_job_id=job.id,
        user_id=user_id,
        exports=[{"format": "glb", "file_path": f"exports/{project_id}.glb", "file_size_bytes": 10}],
    )
    await db.commit()
    return records[0]


async def _report(client, *, project_id=None, template_id=None, **extra):
    body = {"reason": "copyright", "details": DETAILS, **extra}
    if project_id is not None:
        body["project_id"] = str(project_id)
    if template_id is not None:
        body["template_id"] = str(template_id)
    return await client.post("/api/v1/public/content-reports", json=body)


async def _reported(client, project_id) -> str:
    response = await _report(client, project_id=project_id)
    assert response.status_code == 202, response.text
    return response.json()["report_id"]


async def _uphold(client, headers, report_id):
    return await client.post(
        f"/api/v1/admin/content-reports/{report_id}/uphold",
        headers=headers,
        json={"resolution_note": NOTE},
    )


async def _audit_count(db, report_id) -> int:
    return (
        await db.execute(
            text("SELECT count(*) FROM audit_logs WHERE target_id = :rid"), {"rid": str(report_id)}
        )
    ).scalar_one()


async def _link(client, headers, project_id):
    return await client.post(
        f"/api/v1/projects/{project_id}/artisan-links", headers=headers, json={}
    )


# --- Intake ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_report_requires_exactly_one_existing_target(client, db, auth_headers):
    project_id = await _create_project(client, auth_headers)
    _, admin_headers = await _admin(db)
    template = await client.post(
        "/api/v1/admin/templates",
        headers=admin_headers,
        json={"name": "Tet", "category": "seasonal", "design_config": {"baseColor": "red"}},
    )
    template_id = template.json()["id"]

    both = await _report(client, project_id=project_id, template_id=template_id)
    neither = await _report(client)
    missing = await _report(client, project_id=uuid.uuid4())
    for response in (both, neither, missing):
        assert response.status_code == 400
        assert response.json()["code"] == "CONTENT_REPORT_TARGET_INVALID"
    count = (await db.execute(text("SELECT count(*) FROM content_reports"))).scalar_one()
    assert count == 0


@pytest.mark.asyncio
async def test_public_report_is_accepted_and_leaks_nothing(
    client, db, auth_headers, authenticated_user
):
    project_id = await _create_project(client, auth_headers)
    response = await _report(
        client, project_id=project_id, reporter_email="legal@brand.example", reporter_name="Brand"
    )  # no auth header
    assert response.status_code == 202
    body = response.json()
    assert set(body) == {"report_id", "status"}
    assert body["status"] == "new"
    assert str(authenticated_user.id) not in response.text
    assert authenticated_user.email not in response.text

    row = (
        await db.execute(
            text("SELECT status, reported_user_id FROM content_reports WHERE id = :id"),
            {"id": body["report_id"]},
        )
    ).one()
    assert row.status == "new"
    assert row.reported_user_id == authenticated_user.id


@pytest.mark.asyncio
async def test_public_report_is_ip_rate_limited(client, db, auth_headers):
    project_id = await _create_project(client, auth_headers)
    for _ in range(settings.MODERATION_REPORT_RATE_LIMIT):
        assert (await _report(client, project_id=project_id)).status_code == 202
    blocked = await _report(client, project_id=project_id)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


# --- Ladder ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_uphold_is_warning_only(client, db, auth_headers, authenticated_user):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    _, admin_headers = await _admin(db)

    upheld = await _uphold(client, admin_headers, await _reported(client, project_id))
    assert upheld.status_code == 200, upheld.text
    assert upheld.json()["level"] == 1
    assert upheld.json()["action"] == "warning"
    assert upheld.json()["restricted_until"] is None
    assert upheld.json()["report_status"] == "upheld"
    # Warning records only: sharing is not restricted.
    assert (await _link(client, auth_headers, project_id)).status_code == 201


@pytest.mark.asyncio
async def test_second_uphold_restricts_public_sharing_30_days(
    client, db, auth_headers, authenticated_user
):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    existing = (await _link(client, auth_headers, project_id)).json()
    _, admin_headers = await _admin(db)

    await _uphold(client, admin_headers, await _reported(client, project_id))
    before = datetime.now(UTC)
    second = await _uphold(client, admin_headers, await _reported(client, project_id))
    after = datetime.now(UTC)
    assert second.status_code == 200
    assert second.json()["level"] == 2
    assert second.json()["action"] == "share_restriction"
    until = datetime.fromisoformat(second.json()["restricted_until"])
    window = timedelta(days=settings.MODERATION_SHARE_RESTRICTION_DAYS)
    assert before + window <= until <= after + window

    blocked = await _link(client, auth_headers, project_id)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PUBLIC_SHARING_RESTRICTED"
    assert blocked.json()["restricted_until"]
    renew = await client.post(
        f"/api/v1/artisan-links/{existing['id']}/renew", headers=auth_headers
    )
    assert renew.status_code == 403
    assert renew.json()["code"] == "PUBLIC_SHARING_RESTRICTED"


@pytest.mark.asyncio
async def test_existing_artisan_link_returns_410_while_restricted(
    client, db, auth_headers, authenticated_user
):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    live = (await _link(client, auth_headers, project_id)).json()
    revoked = (await _link(client, auth_headers, project_id)).json()
    await client.post(f"/api/v1/artisan-links/{revoked['id']}/revoke", headers=auth_headers)
    revoked_answer = await client.get(f"/api/v1/public/artisan/{revoked['token']}")
    assert (await client.get(f"/api/v1/public/artisan/{live['token']}")).status_code == 200

    _, admin_headers = await _admin(db)
    for _ in range(2):
        await _uphold(client, admin_headers, await _reported(client, project_id))

    view = await client.get(f"/api/v1/public/artisan/{live['token']}")
    download = await client.post(f"/api/v1/public/artisan/{live['token']}/download")
    for response in (view, download):
        assert response.status_code == 410
        # Uniform MSG48 answer: identical to a revoked link, nothing about the restriction.
        assert response.json() == revoked_answer.json()


@pytest.mark.asyncio
async def test_restriction_expires_and_sharing_resumes(
    client, db, auth_headers, authenticated_user
):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    live = (await _link(client, auth_headers, project_id)).json()
    _, admin_headers = await _admin(db)
    for _ in range(2):
        await _uphold(client, admin_headers, await _reported(client, project_id))
    assert (await _link(client, auth_headers, project_id)).status_code == 403

    # Let the restriction run out.
    await db.execute(
        text(
            "UPDATE moderation_actions SET restricted_until = :past "
            "WHERE user_id = :uid AND restricted_until IS NOT NULL"
        ),
        {"past": datetime.now(UTC) - timedelta(seconds=1), "uid": authenticated_user.id},
    )
    await db.commit()

    assert (await _link(client, auth_headers, project_id)).status_code == 201
    assert (await client.get(f"/api/v1/public/artisan/{live['token']}")).status_code == 200
    status = (await client.get("/api/v1/moderation/me", headers=auth_headers)).json()
    assert status["is_restricted"] is False
    assert status["level"] == 2


@pytest.mark.asyncio
async def test_third_uphold_bans_account(client, db, auth_headers, authenticated_user):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    _, admin_headers = await _admin(db)
    levels = []
    for _ in range(3):
        response = await _uphold(client, admin_headers, await _reported(client, project_id))
        assert response.status_code == 200
        levels.append((response.json()["level"], response.json()["action"]))
    assert levels == [(1, "warning"), (2, "share_restriction"), (3, "ban")]
    status = (
        await db.execute(text("SELECT status FROM users WHERE id = :id"), {"id": authenticated_user.id})
    ).scalar_one()
    assert status == "suspended"
    # A suspended account can no longer use its token.
    assert (await client.get("/api/v1/moderation/me", headers=auth_headers)).status_code != 200

    # Never goes back down: a further upheld report stays at the top rung.
    fourth = await _uphold(client, admin_headers, await _reported(client, project_id))
    assert (fourth.json()["level"], fourth.json()["action"]) == (3, "ban")


@pytest.mark.asyncio
async def test_suspended_owner_artisan_link_returns_410(
    client, db, auth_headers, authenticated_user
):
    """XR-C2: SRS_v2.2.txt:1171 "tài khoản bị khoá → MSG48"."""
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    live = (await _link(client, auth_headers, project_id)).json()
    _, admin_headers = await _admin(db)
    await _uphold(client, admin_headers, await _reported(client, project_id))
    await _uphold(client, admin_headers, await _reported(client, project_id))
    # Lift the level-2 restriction so only the ban (level 3) can explain the 410.
    await db.execute(
        text("UPDATE moderation_actions SET restricted_until = NULL WHERE user_id = :uid"),
        {"uid": authenticated_user.id},
    )
    await db.commit()
    assert (await client.get(f"/api/v1/public/artisan/{live['token']}")).status_code == 200

    await _uphold(client, admin_headers, await _reported(client, project_id))
    view = await client.get(f"/api/v1/public/artisan/{live['token']}")
    assert view.status_code == 410
    assert view.json()["code"] == "ARTISAN_LINK_INVALID"


@pytest.mark.asyncio
async def test_dismiss_does_not_advance_the_ladder(client, db, auth_headers, authenticated_user):
    project_id = await _create_project(client, auth_headers)
    _, admin_headers = await _admin(db)
    report_id = await _reported(client, project_id)

    dismissed = await client.post(
        f"/api/v1/admin/content-reports/{report_id}/dismiss",
        headers=admin_headers,
        json={"resolution_note": "Không đủ bằng chứng"},
    )
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"
    assert dismissed.json()["user_actions"] == []
    actions = (await db.execute(text("SELECT count(*) FROM moderation_actions"))).scalar_one()
    assert actions == 0

    upheld = await _uphold(client, admin_headers, await _reported(client, project_id))
    assert upheld.json()["level"] == 1


@pytest.mark.asyncio
async def test_uphold_twice_on_same_report_is_409(client, db, auth_headers):
    project_id = await _create_project(client, auth_headers)
    _, admin_headers = await _admin(db)
    report_id = await _reported(client, project_id)
    assert (await _uphold(client, admin_headers, report_id)).status_code == 200

    again = await _uphold(client, admin_headers, report_id)
    assert again.status_code == 409
    assert again.json()["code"] == "CONTENT_REPORT_RESOLVED"
    dismiss = await client.post(
        f"/api/v1/admin/content-reports/{report_id}/dismiss",
        headers=admin_headers,
        json={"resolution_note": NOTE},
    )
    assert dismiss.status_code == 409
    actions = (await db.execute(text("SELECT count(*) FROM moderation_actions"))).scalar_one()
    assert actions == 1
    unknown = await _uphold(client, admin_headers, uuid.uuid4())
    assert unknown.status_code == 404


@pytest.mark.asyncio
async def test_admin_account_cannot_be_moderated(client, db):
    admin, admin_headers = await _admin(db)
    staff = await _make_user(db, email="staff-target@example.com", username="stafftg", role="staff")
    for owner in (admin, staff):
        template = await client.post(
            "/api/v1/admin/templates",
            headers=admin_headers,
            json={"name": f"T-{owner.role}", "category": "seasonal", "design_config": {}},
        )
        assert template.status_code == 201, template.text
        # The template's owner (created_by) is the account the complaint lands on.
        await db.execute(
            text("UPDATE design_templates SET created_by = :owner WHERE id = :tid"),
            {"owner": owner.id, "tid": template.json()["id"]},
        )
        await db.commit()
        report = await _report(client, template_id=template.json()["id"])
        assert report.status_code == 202
        response = await _uphold(client, admin_headers, report.json()["report_id"])
        assert response.status_code == 403
        assert response.json()["code"] == "MODERATION_TARGET_PROTECTED"
        status = (
            await db.execute(
                text("SELECT status FROM content_reports WHERE id = :id"),
                {"id": report.json()["report_id"]},
            )
        ).scalar_one()
        assert status == "new"
    actions = (await db.execute(text("SELECT count(*) FROM moderation_actions"))).scalar_one()
    assert actions == 0


@pytest.mark.asyncio
async def test_every_decision_writes_an_audit_log(client, db, auth_headers, authenticated_user):
    project_id = await _create_project(client, auth_headers)
    admin, admin_headers = await _admin(db)
    upheld_id = await _reported(client, project_id)
    dismissed_id = await _reported(client, project_id)

    await _uphold(client, admin_headers, upheld_id)
    await client.post(
        f"/api/v1/admin/content-reports/{dismissed_id}/dismiss",
        headers=admin_headers,
        json={"resolution_note": NOTE},
    )
    assert await _audit_count(db, upheld_id) == 1
    assert await _audit_count(db, dismissed_id) == 1
    rows = (
        await db.execute(
            text(
                "SELECT action, actor_id, payload FROM audit_logs "
                "WHERE target_type = 'content_report' ORDER BY created_at"
            )
        )
    ).all()
    assert [row.action for row in rows] == ["content_report.uphold", "content_report.dismiss"]
    assert all(row.actor_id == admin.id for row in rows)
    assert rows[0].payload["level"] == 1
    assert rows[0].payload["user_id"] == str(authenticated_user.id)


@pytest.mark.asyncio
async def test_my_moderation_status_endpoint(client, db, auth_headers):
    clean = (await client.get("/api/v1/moderation/me", headers=auth_headers)).json()
    assert clean == {
        "level": 0, "is_restricted": False, "restricted_until": None, "is_banned": False
    }
    project_id = await _create_project(client, auth_headers)
    _, admin_headers = await _admin(db)
    await _uphold(client, admin_headers, await _reported(client, project_id))
    second = await _uphold(client, admin_headers, await _reported(client, project_id))

    status = (await client.get("/api/v1/moderation/me", headers=auth_headers)).json()
    assert status["level"] == 2
    assert status["is_restricted"] is True
    assert datetime.fromisoformat(status["restricted_until"]) == datetime.fromisoformat(
        second.json()["restricted_until"]
    )
    assert status["is_banned"] is False
    assert (await client.get("/api/v1/moderation/me")).status_code == 401


@pytest.mark.asyncio
async def test_staff_cannot_uphold_but_can_read(client, db, auth_headers, authenticated_user):
    project_id = await _create_project(client, auth_headers)
    _, staff_headers = await _admin(db, role="staff")
    report_id = await _reported(client, project_id)

    for verb in ("uphold", "dismiss"):
        denied = await client.post(
            f"/api/v1/admin/content-reports/{report_id}/{verb}",
            headers=staff_headers,
            json={"resolution_note": NOTE},
        )
        assert denied.status_code == 403
    listing = await client.get("/api/v1/admin/content-reports", headers=staff_headers)
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [report_id]
    detail = await client.get(f"/api/v1/admin/content-reports/{report_id}", headers=staff_headers)
    assert detail.status_code == 200
    assert detail.json()["details"] == DETAILS
    assert detail.json()["status"] == "new"
    history = await client.get(
        f"/api/v1/admin/users/{authenticated_user.id}/moderation-actions", headers=staff_headers
    )
    assert history.status_code == 200
    assert history.json() == []
    # A customer token is not an admin token.
    assert (
        await client.get("/api/v1/admin/content-reports", headers=auth_headers)
    ).status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_listing_filters_and_paginates(client, db, auth_headers, authenticated_user):
    project_id = await _create_project(client, auth_headers)
    admin, admin_headers = await _admin(db)
    ids = [await _reported(client, project_id) for _ in range(3)]
    await _uphold(client, admin_headers, ids[0])

    first = await client.get(
        "/api/v1/admin/content-reports", headers=admin_headers, params={"limit": 1}
    )
    assert len(first.json()["items"]) == 1 and first.json()["next_cursor"]
    seen = [first.json()["items"][0]["id"]]
    cursor = first.json()["next_cursor"]
    while cursor:
        page = await client.get(
            "/api/v1/admin/content-reports",
            headers=admin_headers,
            params={"limit": 1, "cursor": cursor},
        )
        seen += [item["id"] for item in page.json()["items"]]
        cursor = page.json()["next_cursor"]
    assert sorted(seen) == sorted(ids)

    open_only = await client.get(
        "/api/v1/admin/content-reports", headers=admin_headers, params={"status": "new"}
    )
    assert sorted(item["id"] for item in open_only.json()["items"]) == sorted(ids[1:])

    history = await client.get(
        f"/api/v1/admin/users/{authenticated_user.id}/moderation-actions", headers=admin_headers
    )
    assert [(a["level"], a["report_status"], a["created_by"]) for a in history.json()] == [
        (1, "upheld", str(admin.id))
    ]
    missing = await client.get(
        f"/api/v1/admin/users/{uuid.uuid4()}/moderation-actions", headers=admin_headers
    )
    assert missing.status_code == 404
