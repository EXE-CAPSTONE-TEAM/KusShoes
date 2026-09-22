from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import bcrypt
import pytest

from app.utils.jwt import create_access_token


async def _create_project(client, headers, name="Studio Shoe"):
    response = await client.post("/api/v1/projects", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


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


async def _admin(db):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email="studio-admin@example.com",
        username="studioadmin",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="Studio",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}


# Every accepted save moves the project's design revision forward by one (optimistic concurrency),
# so the helper sends the revision the previous successful save produced.
_revisions: dict[str, int] = {}


async def _save(client, service_headers, project_id, config):
    response = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": config, "base_revision": _revisions.get(project_id, 0)},
    )
    if response.status_code == 200:
        _revisions[project_id] = _revisions.get(project_id, 0) + 1
    return response


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


# --- BR-46 version history -----------------------------------------------------------


@pytest.mark.asyncio
async def test_save_creates_versions_and_skips_identical(
    client, service_headers, auth_headers
):
    project_id = await _create_project(client, auth_headers)
    await _save(client, service_headers, project_id, {"baseColor": "red"})
    await _save(client, service_headers, project_id, {"baseColor": "red"})  # identical
    await _save(client, service_headers, project_id, {"baseColor": "blue"})

    versions = (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=auth_headers)
    ).json()
    assert [v["version_no"] for v in versions] == [2, 1]


@pytest.mark.asyncio
async def test_restore_version_writes_new_latest(client, service_headers, auth_headers):
    project_id = await _create_project(client, auth_headers)
    await _save(client, service_headers, project_id, {"baseColor": "red"})
    await _save(client, service_headers, project_id, {"baseColor": "blue"})
    versions = (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=auth_headers)
    ).json()
    oldest = versions[-1]

    restored = await client.post(
        f"/api/v1/projects/{project_id}/versions/{oldest['id']}/restore", headers=auth_headers
    )
    assert restored.status_code == 200
    assert restored.json()["version_no"] == 3
    detail = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert detail.json()["design_config"] == {"baseColor": "red"}


@pytest.mark.asyncio
async def test_prune_keeps_pinned_and_respects_plan_limit(
    client, db, service_headers, auth_headers, authenticated_user
):
    import uuid

    from app.repositories import design_version_repo

    project_id = await _create_project(client, auth_headers)
    await _save(client, service_headers, project_id, {"n": 0})
    first = (await design_version_repo.list_for_project(db, uuid.UUID(project_id)))[0]
    first.is_pinned = True
    await db.commit()
    for n in range(1, 25):
        await _save(client, service_headers, project_id, {"n": n})

    versions = (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=auth_headers)
    ).json()
    unpinned = [v for v in versions if not v["is_pinned"]]
    assert len(unpinned) == 20  # free plan keeps last 20
    assert any(v["is_pinned"] and v["version_no"] == 1 for v in versions)


@pytest.mark.asyncio
async def test_bake_pins_version(
    client, db, service_headers, auth_headers, authenticated_user
):
    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    with patch("app.infrastructure.task_queue.enqueue_bake"):
        response = await client.post(
            f"/api/v1/projects/{project_id}/bake",
            headers=service_headers,
            json={"design_config": {"baseColor": "green"}},
        )
    assert response.status_code == 202
    versions = (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=auth_headers)
    ).json()
    assert versions[0]["is_pinned"] is True
    assert versions[0]["export_bake_job_id"] == response.json()["job_id"]


# --- BR-45 edit lock ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_blocked_while_exporting_then_released(
    client, db, service_headers, auth_headers, authenticated_user
):
    import uuid

    from app.repositories import bake_job_repo

    project_id = await _create_project(client, auth_headers)
    job = await bake_job_repo.create(
        db, project_id=uuid.UUID(project_id), design_config={}, priority="low"
    )
    await db.commit()

    blocked = await _save(client, service_headers, project_id, {"baseColor": "red"})
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "PROJECT_EXPORTING"

    # A job stuck for >5 minutes stops blocking the owner.
    job.queued_at = datetime.now(UTC) - timedelta(minutes=6)
    await db.commit()
    assert (await _save(client, service_headers, project_id, {"baseColor": "red"})).status_code == 200


# --- BR-54 guardrail ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guardrail_text_length_banned_and_trademark(client, service_headers, auth_headers):
    project_id = await _create_project(client, auth_headers)

    too_long = await _save(
        client, service_headers, project_id, {"texts": [{"id": "1", "value": "x" * 21}]}
    )
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "CONTENT_TEXT_TOO_LONG"

    banned = await _save(
        client, service_headers, project_id, {"texts": [{"id": "1", "value": "Fuck!"}]}
    )
    assert banned.status_code == 422
    assert banned.json()["code"] == "CONTENT_BANNED"

    trademark = await _save(
        client, service_headers, project_id, {"texts": [{"id": "1", "value": "NIKE Air"}]}
    )
    assert trademark.status_code == 422
    assert trademark.json()["code"] == "CONTENT_TRADEMARK_CONFIRM_REQUIRED"
    assert trademark.json()["terms"] == ["nike"]

    confirmed = await _save(
        client,
        service_headers,
        project_id,
        {"texts": [{"id": "1", "value": "NIKE Air"}], "copyrightConfirmed": True},
    )
    assert confirmed.status_code == 200

    # Word boundary: "Nikeish" is not the brand.
    fine = await _save(
        client, service_headers, project_id, {"texts": [{"id": "1", "value": "Nikeish"}]}
    )
    assert fine.status_code == 200


@pytest.mark.asyncio
async def test_admin_guardrail_crud_is_audited(client, db, service_headers, auth_headers):
    admin_headers = await _admin(db)
    created = await client.post(
        "/api/v1/admin/guardrail-rules",
        headers=admin_headers,
        json={"kind": "banned", "term": "Từ Cấm"},
    )
    assert created.status_code == 201
    assert created.json()["term"] == "tu cam"
    duplicate = await client.post(
        "/api/v1/admin/guardrail-rules",
        headers=admin_headers,
        json={"kind": "banned", "term": "tu cam"},
    )
    assert duplicate.status_code == 409

    project_id = await _create_project(client, auth_headers)
    blocked = await _save(
        client, service_headers, project_id, {"texts": [{"id": "1", "value": "TỪ CẤM"}]}
    )
    assert blocked.json()["code"] == "CONTENT_BANNED"

    rule_id = created.json()["id"]
    await client.patch(
        f"/api/v1/admin/guardrail-rules/{rule_id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert (
        await _save(client, service_headers, project_id, {"texts": [{"id": "1", "value": "tu cam"}]})
    ).status_code == 200

    assert (
        await client.delete(f"/api/v1/admin/guardrail-rules/{rule_id}", headers=admin_headers)
    ).status_code == 200
    from sqlalchemy import text

    actions = (await db.execute(text("SELECT action FROM audit_logs"))).scalars().all()
    assert {"guardrail.create", "guardrail.update", "guardrail.delete"} <= set(actions)


# --- Templates ------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_template_lifecycle_and_apply(client, db, service_headers, auth_headers):
    admin_headers = await _admin(db)
    config = {"baseColor": "gold", "stickers": [{"id": "s1"}, {"id": "s2"}]}
    created = await client.post(
        "/api/v1/admin/templates",
        headers=admin_headers,
        json={"name": "Tet", "category": "seasonal", "design_config": config},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "pending"
    assert created.json()["layer_count"] == 2
    template_id = created.json()["id"]

    assert (await client.get("/api/v1/templates", headers=auth_headers)).json() == []
    await client.post(f"/api/v1/admin/templates/{template_id}/approve", headers=admin_headers)
    gallery = (await client.get("/api/v1/templates", headers=auth_headers)).json()
    assert [t["id"] for t in gallery] == [template_id]

    project_id = await _create_project(client, auth_headers)
    applied = await client.post(
        f"/api/v1/projects/{project_id}/apply-template/{template_id}", headers=auth_headers
    )
    assert applied.status_code == 200
    detail = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert detail.json()["design_config"] == config
    versions = (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=auth_headers)
    ).json()
    assert len(versions) == 1

    await client.post(f"/api/v1/admin/templates/{template_id}/reject", headers=admin_headers)
    again = await client.post(
        f"/api/v1/projects/{project_id}/apply-template/{template_id}", headers=auth_headers
    )
    assert again.status_code == 404


@pytest.mark.asyncio
async def test_template_blocked_by_guardrail_and_layer_cap(client, db, auth_headers):
    admin_headers = await _admin(db)
    banned = await client.post(
        "/api/v1/admin/templates",
        headers=admin_headers,
        json={"name": "Bad", "design_config": {"texts": [{"id": "1", "value": "shit"}]}},
    )
    assert banned.status_code == 422

    big = await client.post(
        "/api/v1/admin/templates",
        headers=admin_headers,
        json={
            "name": "Big",
            "design_config": {"stickers": [{"id": str(i)} for i in range(31)]},
        },
    )
    template_id = big.json()["id"]
    await client.post(f"/api/v1/admin/templates/{template_id}/approve", headers=admin_headers)
    project_id = await _create_project(client, auth_headers)
    response = await client.post(
        f"/api/v1/projects/{project_id}/apply-template/{template_id}", headers=auth_headers
    )
    assert response.status_code == 403
    assert response.json()["code"] == "DESIGN_LAYER_LIMIT_EXCEEDED"


# --- Artisan links --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_artisan_link_requires_paid_plan_and_export(
    client, db, auth_headers, authenticated_user
):
    import uuid

    project_id = await _create_project(client, auth_headers)
    free = await client.post(
        f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers, json={}
    )
    assert free.status_code == 403
    assert free.json()["code"] == "ARTISAN_LINK_PLAN_REQUIRED"

    await _upgrade(db, authenticated_user.id)
    no_export = await client.post(
        f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers, json={}
    )
    assert no_export.status_code == 409
    assert no_export.json()["code"] == "EXPORT_NOT_READY"

    from app.repositories import subscription_repo

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    subscription.status = "grace"
    await db.commit()
    grace = await client.post(
        f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers, json={}
    )
    assert grace.status_code == 403


@pytest.mark.asyncio
async def test_artisan_link_public_flow(client, db, auth_headers, authenticated_user):
    import uuid

    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers, "Artisan Shoe")
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)

    created = await client.post(
        f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers, json={}
    )
    assert created.status_code == 201
    body = created.json()
    token = body["token"]
    assert body["url"].endswith(token)
    assert body["max_downloads"] == 20

    # Only the hash is persisted, never the raw token.
    from sqlalchemy import text

    stored = (await db.execute(text("SELECT token_hash FROM artisan_links"))).scalar_one()
    assert stored != token and len(stored) == 64

    listing = (
        await client.get(f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers)
    ).json()
    assert "token" not in listing[0]

    view = await client.get(f"/api/v1/public/artisan/{token}")  # no auth header
    assert view.status_code == 200
    assert view.json()["project_name"] == "Artisan Shoe"
    assert view.json()["downloads_remaining"] == 20

    with patch(
        "app.infrastructure.storage.generate_presigned_download_url", return_value="http://signed"
    ) as signer:
        download = await client.post(f"/api/v1/public/artisan/{token}/download")
    assert download.status_code == 200
    assert download.json()["download_url"] == "http://signed"
    assert signer.call_args.kwargs["ttl"] <= 900

    view = await client.get(f"/api/v1/public/artisan/{token}")
    assert view.json()["downloads_remaining"] == 19


@pytest.mark.asyncio
async def test_artisan_link_invalid_revoked_expired_exhausted(
    client, db, auth_headers, authenticated_user
):
    import uuid

    from app.repositories import artisan_link_repo
    from app.services.artisan_service import hash_token

    unknown = await client.get("/api/v1/public/artisan/not-a-real-token")
    assert unknown.status_code == 410
    assert unknown.json()["code"] == "ARTISAN_LINK_INVALID"

    await _upgrade(db, authenticated_user.id)
    project_id = await _create_project(client, auth_headers)
    await _seed_export(db, uuid.UUID(project_id), authenticated_user.id)
    created = (
        await client.post(
            f"/api/v1/projects/{project_id}/artisan-links", headers=auth_headers, json={}
        )
    ).json()
    token = created["token"]
    link = await artisan_link_repo.get_by_hash(db, hash_token(token))

    link.download_count = link.max_downloads
    await db.commit()
    assert (await client.get(f"/api/v1/public/artisan/{token}")).status_code == 410

    renewed = await client.post(
        f"/api/v1/artisan-links/{created['id']}/renew", headers=auth_headers
    )
    assert renewed.status_code == 200
    assert renewed.json()["download_count"] == 0
    assert (await client.get(f"/api/v1/public/artisan/{token}")).status_code == 200

    link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    assert (await client.get(f"/api/v1/public/artisan/{token}")).status_code == 410

    link.expires_at = datetime.now(UTC) + timedelta(days=1)
    await db.commit()
    revoked = await client.post(
        f"/api/v1/artisan-links/{created['id']}/revoke", headers=auth_headers
    )
    assert revoked.status_code == 200
    assert (await client.get(f"/api/v1/public/artisan/{token}")).status_code == 410


@pytest.mark.asyncio
async def test_artisan_public_rate_limited(client, db, redis):
    from app.services import artisan_service

    with patch.object(artisan_service, "PUBLIC_RATE_LIMIT", 2):
        codes = [
            (await client.get("/api/v1/public/artisan/nope")).status_code for _ in range(3)
        ]
    assert codes == [410, 410, 429]
    async for key in redis.scan_iter("rate-limit:artisan-public:*"):
        await redis.delete(key)


# --- Reference pack -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reference_pack_pdf(client, service_headers, auth_headers):
    project_id = await _create_project(client, auth_headers, "Giày Sen")
    await _save(
        client,
        service_headers,
        project_id,
        {
            "baseColor": "#ffffff",
            "texts": [{"id": "t", "value": "Sen", "font": "Roboto", "color": "#111111"}],
            "stickers": [{"id": "s", "source": "preset", "scale": 1}],
        },
    )
    response = await client.get(
        f"/api/v1/projects/{project_id}/reference-pack?token=abc123", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_versions_owner_only(client, db, service_headers, auth_headers):
    from app.repositories import user_repo

    project_id = await _create_project(client, auth_headers)
    other = await user_repo.create_email_user(
        db,
        email="other-studio@example.com",
        username="otherstudio",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="O",
        last_name="U",
    )
    other.is_verified = True
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(other.id))}"}
    assert (
        await client.get(f"/api/v1/projects/{project_id}/versions", headers=headers)
    ).status_code == 403
