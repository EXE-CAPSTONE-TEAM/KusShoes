"""Client-executed bake jobs: claim → desktop → complete / fail (spec §A, Ticket-01)."""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.exceptions import JobAlreadyClaimed
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    plan_repo,
    project_repo,
    subscription_repo,
)
from app.schemas.editor import EditorJobCompleteRequest
from app.services import job_service, quota_service
from app.services.auth_service import EDITOR_SCOPES
from app.utils.jwt import create_editor_access_token
from tests.conftest import _TestSession
from tests.job_helpers import GLB_BYTES, ZIP_BYTES, FakeStorage, attach_ready_model


async def _set_plan(db, user_id, tier: str):
    """Free has 0 exports/cycle (BR-99). Pro exports glb + obj (unlimited); Basic glb only."""
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, "monthly")
    subscription = await subscription_repo.get_by_user(db, user_id)
    subscription.plan_id = plan.id
    subscription.plan = plan
    subscription.tier = f"{tier}_monthly"
    await db.commit()
    return subscription


async def _project_with_job(client, db, auth_headers, service_headers, user, tier="pro"):
    await _set_plan(db, user.id, tier)
    created = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Shoe"})
    project_id = created.json()["id"]
    await attach_ready_model(db, project_id, user.id)
    bake = await client.post(
        f"/api/v1/projects/{project_id}/bake",
        headers=service_headers,
        json={"design_config": {"color": "red"}},
    )
    assert bake.status_code == 202, bake.text
    editor = {
        "Authorization": "Bearer "
        + create_editor_access_token(str(user.id), project_id, list(EDITOR_SCOPES))
    }
    return project_id, bake.json()["job_id"], editor


async def _claim(client, editor, job_id):
    response = await client.post(f"/api/v1/editor/jobs/{job_id}/claim", headers=editor, json={})
    assert response.status_code == 200, response.text
    return response.json()


def _upload_all(fake: FakeStorage, payload: dict) -> list[dict]:
    outputs = []
    for output in payload["outputs"]:
        data = GLB_BYTES if output["format"] == "glb" else ZIP_BYTES
        fake.objects[output["file_path"]] = data
        outputs.append(
            {"format": output["format"], "filePath": output["file_path"], "fileSizeBytes": len(data)}
        )
    return outputs


async def _complete(client, job_id, token, outputs, **extra):
    return await client.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": token},
        json={"outputs": outputs, **extra},
    )


@pytest.mark.asyncio
async def test_claim_complete_finalizes_exports_and_charges_quota_once(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    before = (await quota_service.get_usage(db, authenticated_user.id, subscription)).exports_count

    claimed = await _claim(client, editor, job_id)
    assert claimed["job"]["status"] == "claimed"
    staging = [output["file_path"] for output in claimed["payload"]["outputs"]]
    assert all(path.startswith(f"staging/{project_id}/{job_id}/") for path in staging)

    done = await _complete(client, job_id, claimed["claimToken"], _upload_all(fake, claimed["payload"]))
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"

    records = await export_record_repo.list_for_project(db, uuid.UUID(project_id))
    assert {r.file_path for r in records} == {
        dst for src, dst in fake.copies if src in staging
    }
    assert all(r.file_path.startswith(f"exports/{project_id}/{job_id}/") for r in records)
    assert all(path not in fake.objects for path in staging)  # staging removed after finalize
    after = (await quota_service.get_usage(db, authenticated_user.id, subscription)).exports_count
    assert after - before == len(staging)

    # Same token again: identical answer, no second export set or quota charge.
    again = await _complete(client, job_id, claimed["claimToken"], [])
    assert again.status_code == 422  # body still validated (outputs min 1)
    replay = await _complete(
        client,
        job_id,
        claimed["claimToken"],
        [{"format": "glb", "filePath": staging[0], "fileSizeBytes": 1}],
    )
    assert replay.status_code == 200
    assert replay.json()["status"] == "completed"
    assert len(await export_record_repo.list_for_project(db, uuid.UUID(project_id))) == len(records)
    final = (await quota_service.get_usage(db, authenticated_user.id, subscription)).exports_count
    assert final == after


@pytest.mark.asyncio
async def test_concurrent_claims_have_exactly_one_winner(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    FakeStorage().install(monkeypatch)
    project_id, job_id, _ = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )

    async def attempt():
        async with _TestSession() as session:
            project = await project_repo.get_by_id(session, uuid.UUID(project_id))
            try:
                await job_service.claim(session, uuid.UUID(job_id), project=project, device_label=None)
                return "won"
            except JobAlreadyClaimed:
                return "lost"

    results = await asyncio.gather(*(attempt() for _ in range(4)))
    assert sorted(results) == ["lost", "lost", "lost", "won"]


@pytest.mark.asyncio
async def test_concurrent_completes_with_same_token_apply_effects_once(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    claimed = await _claim(client, editor, job_id)
    outputs = _upload_all(fake, claimed["payload"])
    body = EditorJobCompleteRequest(outputs=outputs)

    async def attempt():
        async with _TestSession() as session:
            job = await job_service.complete(session, uuid.UUID(job_id), claimed["claimToken"], body)
            return job.status

    assert await asyncio.gather(attempt(), attempt(), attempt()) == ["completed"] * 3
    records = await export_record_repo.list_for_project(db, uuid.UUID(project_id))
    assert len(records) == len(outputs)


@pytest.mark.asyncio
async def test_late_complete_is_accepted_until_someone_reclaims(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    first = await _claim(client, editor, job_id)
    first_outputs = _upload_all(fake, first["payload"])

    job = await bake_job_repo.get_by_id(db, uuid.UUID(job_id))
    job.claim_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()

    second = await _claim(client, editor, job_id)  # lease expired → re-claim allowed
    assert second["claimId"] != first["claimId"]
    assert all(o["filePath"] not in fake.objects for o in first_outputs)  # old staging dropped

    superseded = await _complete(client, job_id, first["claimToken"], first_outputs)
    assert superseded.status_code == 409
    assert superseded.json()["code"] == "JOB_CLAIM_SUPERSEDED"

    job = await bake_job_repo.get_by_id(db, uuid.UUID(job_id))
    await db.refresh(job)
    job.claim_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    late = await _complete(client, job_id, second["claimToken"], _upload_all(fake, second["payload"]))
    assert late.status_code == 200, late.text

    foreign = await _complete(client, job_id, "not-a-token", first_outputs)
    assert foreign.status_code == 403
    assert foreign.json()["code"] == "JOB_CLAIM_MISMATCH"


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["wrong_path", "size_mismatch", "bad_magic", "missing_format"])
async def test_invalid_outputs_are_rejected_and_job_stays_claimed(
    defect, client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    claimed = await _claim(client, editor, job_id)
    outputs = _upload_all(fake, claimed["payload"])
    if defect == "wrong_path":
        outputs[0]["filePath"] = f"exports/{project_id}/{job_id}/final_shoe.glb"
    elif defect == "size_mismatch":
        outputs[0]["fileSizeBytes"] += 1
    elif defect == "bad_magic":
        fake.objects[outputs[0]["filePath"]] = b"NOPE" + b"\x00" * (outputs[0]["fileSizeBytes"] - 4)
    else:
        outputs = outputs[:-1]

    response = await _complete(client, job_id, claimed["claimToken"], outputs)
    assert response.status_code == 422
    assert response.json()["code"] == "JOB_OUTPUT_INVALID"
    job = await bake_job_repo.get_by_id(db, uuid.UUID(job_id))
    await db.refresh(job)
    assert job.status == "claimed"
    assert not await export_record_repo.list_for_project(db, uuid.UUID(project_id))


@pytest.mark.asyncio
async def test_new_bake_is_refused_while_a_live_claim_runs(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    await _claim(client, editor, job_id)
    blocked = await client.post(
        f"/api/v1/projects/{project_id}/bake",
        headers=service_headers,
        json={"design_config": {"color": "blue"}},
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "PROJ_BAKE_IN_PROGRESS"


@pytest.mark.asyncio
async def test_complete_fails_job_when_canonical_model_changed(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    claimed = await _claim(client, editor, job_id)
    outputs = _upload_all(fake, claimed["payload"])
    await attach_ready_model(db, project_id, authenticated_user.id)  # canonical swapped

    response = await _complete(client, job_id, claimed["claimToken"], outputs)
    assert response.status_code == 409
    assert response.json()["code"] == "EDITOR_MODEL_CHANGED"
    job = await bake_job_repo.get_by_id(db, uuid.UUID(job_id))
    await db.refresh(job)
    assert job.status == "failed"
    assert all(o["filePath"] not in fake.objects for o in outputs)


@pytest.mark.asyncio
async def test_complete_rechecks_quota(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user, tier="basic"
    )
    claimed = await _claim(client, editor, job_id)
    outputs = _upload_all(fake, claimed["payload"])
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    cap = subscription.plan.max_exports_per_month
    await quota_service.increment_exports(db, authenticated_user.id, subscription, cap)
    await db.commit()

    response = await _complete(client, job_id, claimed["claimToken"], outputs)
    assert response.status_code == 403
    assert response.json()["code"] == "QUOTA_EXPORT_EXCEEDED"
    job = await bake_job_repo.get_by_id(db, uuid.UUID(job_id))
    await db.refresh(job)
    assert job.status == "failed"


@pytest.mark.asyncio
async def test_fail_releases_the_project_and_cleans_staging(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    fake = FakeStorage().install(monkeypatch)
    project_id, job_id, editor = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    claimed = await _claim(client, editor, job_id)
    outputs = _upload_all(fake, claimed["payload"])

    wrong = await client.post(
        f"/api/v1/editor/jobs/{job_id}/fail",
        headers={"X-Claim-Token": "not-a-token"},
        json={"code": "BLENDER_MISSING", "message": "Blender not found"},
    )
    assert wrong.status_code == 409  # live claim held by another token
    failed = await client.post(
        f"/api/v1/editor/jobs/{job_id}/fail",
        headers={"X-Claim-Token": claimed["claimToken"]},
        json={"code": "BLENDER_MISSING", "message": "Blender not found"},
    )
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    assert "BLENDER_MISSING" in failed.json()["errorMessage"]
    assert all(o["filePath"] not in fake.objects for o in outputs)
    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    await db.refresh(project)
    assert project.status == "in_progress"

    retry = await client.post(
        f"/api/v1/projects/{project_id}/bake",
        headers=service_headers,
        json={"design_config": {"color": "red"}},
    )
    assert retry.status_code == 202


@pytest.mark.asyncio
async def test_claim_requires_the_session_project(
    client, db, auth_headers, service_headers, authenticated_user, monkeypatch
):
    FakeStorage().install(monkeypatch)
    _, job_id, _ = await _project_with_job(
        client, db, auth_headers, service_headers, authenticated_user
    )
    other = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Other"})
    other_editor = {
        "Authorization": "Bearer "
        + create_editor_access_token(
            str(authenticated_user.id), other.json()["id"], list(EDITOR_SCOPES)
        )
    }
    response = await client.post(
        f"/api/v1/editor/jobs/{job_id}/claim", headers=other_editor, json={}
    )
    assert response.status_code == 404
