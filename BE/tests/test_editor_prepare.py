"""Integration tests for prepare jobs and raw model lifecycle (spec §A, §B.2-B.3, §B.6, Ticket-07)."""
import uuid

import pytest

from app.models.project_asset import ProjectAsset
from app.repositories import bake_job_repo, project_asset_repo, project_repo
from app.services.auth_service import EDITOR_SCOPES
from app.utils.jwt import create_editor_access_token
from tests.job_helpers import GLB_BYTES, FakeStorage, attach_ready_model

# Valid box in the sidecar's normalized crop contract (whole model).
CROP = {
    "center": {"x": 0.0, "y": 0.0, "z": 0.0},
    "size": {"x": 1.0, "y": 1.0, "z": 1.0},
    "coordinateSpace": "normalized",
}


def _editor_headers(user_id: uuid.UUID, project_id: uuid.UUID | str) -> dict[str, str]:
    token = create_editor_access_token(str(user_id), str(project_id), list(EDITOR_SCOPES))
    return {"Authorization": f"Bearer {token}"}


async def _create_project_with_raw_model(client, db, auth_headers, user) -> tuple[str, ProjectAsset, dict[str, str]]:
    created = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Prepare Shoe"})
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]
    raw_asset = await attach_ready_model(db, project_id, user.id, status="raw")
    headers = _editor_headers(user.id, project_id)
    return project_id, raw_asset, headers


@pytest.mark.asyncio
async def test_prepare_requires_raw_model(client, db, auth_headers, authenticated_user):
    """POST /projects/{id}/prepare returns 409 EDITOR_NO_RAW_MODEL when no raw asset exists."""
    created = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "No Raw"})
    project_id = created.json()["id"]
    headers = _editor_headers(authenticated_user.id, project_id)

    # No asset at all
    res = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=headers,
        json={"cropBox": CROP},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "EDITOR_NO_RAW_MODEL"

    # With ready model only, still no raw model
    await attach_ready_model(db, project_id, authenticated_user.id, status="ready")
    res2 = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=headers,
        json={"cropBox": CROP},
    )
    assert res2.status_code == 409
    assert res2.json()["code"] == "EDITOR_NO_RAW_MODEL"


@pytest.mark.asyncio
async def test_prepare_lifecycle_creates_ready_asset_and_sets_canonical(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """Claim -> complete creates ready asset with derived_from_asset_id, swaps canonical, raw kept."""
    fake = FakeStorage().install(monkeypatch)
    project_id, raw_asset, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )

    crop_box = {
        "center": {"x": 0.0, "y": 0.0, "z": 0.0},
        "size": {"x": 1.0, "y": 1.0, "z": 1.0},
        "coordinateSpace": "normalized",
    }
    prepare_res = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=editor,
        json={"cropBox": crop_box},
    )
    assert prepare_res.status_code == 202, prepare_res.text
    job_info = prepare_res.json()
    assert job_info["type"] == "prepare"
    assert job_info["status"] == "awaiting_client"
    job_id = job_info["id"]

    # Claim job
    claim_res = await client.post(f"/api/v1/editor/jobs/{job_id}/claim", headers=editor, json={})
    assert claim_res.status_code == 200, claim_res.text
    claim_data = claim_res.json()
    token = claim_data["claimToken"]
    payload = claim_data["payload"]

    # Verify snake_case keys for sidecar contract (Ticket-08 note in verification.md)
    assert payload["job_id"] == job_id
    assert payload["project_id"] == project_id
    assert payload["crop_box"] == {**crop_box, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0}}
    assert payload["source_model"]["asset_id"] == str(raw_asset.id)
    assert payload["source_model"]["mime_type"] == "model/gltf-binary"
    assert len(payload["outputs"]) == 1
    output_cap = payload["outputs"][0]
    assert output_cap["format"] == "glb"
    assert output_cap["content_type"] == "model/gltf-binary"
    staging_path = output_cap["file_path"]
    assert staging_path.startswith(f"staging/{project_id}/{job_id}/")
    assert staging_path.endswith("/prepared.glb")

    # Upload output GLB to fake storage
    fake.objects[staging_path] = GLB_BYTES

    # Complete job
    cleanup_report = {"triangleCountBefore": 10000, "triangleCountAfter": 8000}
    complete_res = await client.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": token},
        json={
            "outputs": [
                {
                    "format": "glb",
                    "filePath": staging_path,
                    "fileSizeBytes": len(GLB_BYTES),
                }
            ],
            "cleanupReport": cleanup_report,
        },
    )
    assert complete_res.status_code == 200, complete_res.text
    completed_job = complete_res.json()
    assert completed_job["status"] == "completed"

    # Staging object deleted, final object copied to models/{project_id}/{job_id}/prepared.glb
    final_path = f"models/{project_id}/{job_id}/prepared.glb"
    assert staging_path not in fake.objects
    assert final_path in fake.objects
    assert fake.objects[final_path] == GLB_BYTES

    # Check database state: ready asset created, derived from raw, canonical swapped, raw kept
    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    assert project is not None
    assert project.canonical_model_asset_id != raw_asset.id

    ready_asset = await project_asset_repo.get_by_id(db, project.canonical_model_asset_id)
    assert ready_asset is not None
    assert ready_asset.status == "ready"
    assert ready_asset.derived_from_asset_id == raw_asset.id
    assert ready_asset.file_path == final_path
    assert ready_asset.file_size_bytes == len(GLB_BYTES)
    assert ready_asset.metadata_ == cleanup_report

    # Raw asset is still present with status 'raw'
    persisted_raw = await project_asset_repo.get_by_id(db, raw_asset.id)
    assert persisted_raw is not None
    assert persisted_raw.status == "raw"

    # Replay complete is idempotent
    replay_res = await client.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": token},
        json={
            "outputs": [
                {
                    "format": "glb",
                    "filePath": staging_path,
                    "fileSizeBytes": len(GLB_BYTES),
                }
            ],
        },
    )
    assert replay_res.status_code == 200
    assert replay_res.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_re_crop_with_design_requires_confirmation_and_resets_design(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """Spec §B.6 (OD-1): existing design without confirmResetDesign -> 409; with it -> resets design."""
    fake = FakeStorage().install(monkeypatch)
    project_id, raw_asset, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )

    # 1. Initial prepare to get a ready model
    res1 = await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})
    job1_id = res1.json()["id"]
    claimed1 = (await client.post(f"/api/v1/editor/jobs/{job1_id}/claim", headers=editor, json={})).json()
    stg1 = claimed1["payload"]["outputs"][0]["file_path"]
    fake.objects[stg1] = GLB_BYTES
    await client.post(
        f"/api/v1/editor/jobs/{job1_id}/complete",
        headers={"X-Claim-Token": claimed1["claimToken"]},
        json={"outputs": [{"format": "glb", "filePath": stg1, "fileSizeBytes": len(GLB_BYTES)}]},
    )

    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    canonical_id = project.canonical_model_asset_id

    # 2. Save a design with stickers and texts on the ready model
    sticker_asset_id = uuid.uuid4()
    design_payload = {
        "designConfig": {
            "modelAssetId": str(canonical_id),
            "baseColor": "#FA531C",
            "stickers": [
                {
                    "assetId": str(sticker_asset_id),
                    "position": [0.1, 0.2, 0.3],
                    "scale": 1.0,
                }
            ],
            "texts": [
                {
                    "value": "KusShoes",
                    "font": "Inter",
                    "color": "#000000",
                    "position": [0.0, 0.0, 0.0],
                }
            ],
        },
        "baseRevision": 0,
    }
    save_res = await client.post(
        f"/api/v1/editor/projects/{project_id}/designs",
        headers=editor,
        json=design_payload,
    )
    assert save_res.status_code == 200, save_res.text

    # 3. Re-crop without confirmResetDesign -> 409 EDITOR_DESIGN_RESET_REQUIRED
    blocked = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=editor,
        json={"cropBox": CROP, "confirmResetDesign": False},
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "EDITOR_DESIGN_RESET_REQUIRED"

    # 4. Re-crop with confirmResetDesign=True -> succeeds
    re_crop = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=editor,
        json={"cropBox": CROP, "confirmResetDesign": True},
    )
    assert re_crop.status_code == 202, re_crop.text
    job2_id = re_crop.json()["id"]

    # 5. Claim and complete the re-crop
    claimed2 = (await client.post(f"/api/v1/editor/jobs/{job2_id}/claim", headers=editor, json={})).json()
    stg2 = claimed2["payload"]["outputs"][0]["file_path"]
    fake.objects[stg2] = GLB_BYTES
    comp2 = await client.post(
        f"/api/v1/editor/jobs/{job2_id}/complete",
        headers={"X-Claim-Token": claimed2["claimToken"]},
        json={"outputs": [{"format": "glb", "filePath": stg2, "fileSizeBytes": len(GLB_BYTES)}]},
    )
    assert comp2.status_code == 200, comp2.text

    # 6. Verify design was reset on complete
    await db.refresh(project)
    new_canonical_id = project.canonical_model_asset_id
    assert new_canonical_id != canonical_id

    # Revision incremented
    assert project.current_design_revision == 2
    assert project.design_config is not None
    assert project.design_config["modelAssetId"] == str(new_canonical_id)
    assert project.design_config["stickers"] == []
    assert project.design_config["texts"] == []


@pytest.mark.asyncio
async def test_editor_context_exposes_model_status_and_raw_asset_id(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """Editor context reflects modelStatus ('raw' then 'ready') and rawModelAssetId."""
    fake = FakeStorage().install(monkeypatch)
    project_id, raw_asset, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )

    # Before prepare: modelStatus is 'raw', rawModelAssetId matches raw_asset.id
    ctx_res = await client.get(f"/api/v1/editor/projects/{project_id}/context", headers=editor)
    assert ctx_res.status_code == 200, ctx_res.text
    context = ctx_res.json()
    assert context["modelStatus"] == "raw"
    assert context["rawModelAssetId"] == str(raw_asset.id)
    assert context["modelAsset"] is not None
    assert context["modelAsset"]["status"] == "raw"

    # Prepare and complete
    prepare_res = await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})
    job_id = prepare_res.json()["id"]
    claimed = (await client.post(f"/api/v1/editor/jobs/{job_id}/claim", headers=editor, json={})).json()
    stg = claimed["payload"]["outputs"][0]["file_path"]
    fake.objects[stg] = GLB_BYTES
    await client.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": claimed["claimToken"]},
        json={"outputs": [{"format": "glb", "filePath": stg, "fileSizeBytes": len(GLB_BYTES)}]},
    )

    # After prepare: modelStatus is 'ready', rawModelAssetId still points to raw_asset.id (for re-crop)
    ctx_res2 = await client.get(f"/api/v1/editor/projects/{project_id}/context", headers=editor)
    assert ctx_res2.status_code == 200, ctx_res2.text
    context2 = ctx_res2.json()
    assert context2["modelStatus"] == "ready"
    assert context2["rawModelAssetId"] == str(raw_asset.id)
    assert context2["modelAsset"]["status"] == "ready"


@pytest.mark.asyncio
async def test_prepare_supersession_and_concurrency_lock(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """Unclaimed prepare job is superseded; live claimed prepare job blocks with 409."""
    FakeStorage().install(monkeypatch)
    project_id, raw_asset, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )

    # Create job 1
    j1 = (await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})).json()
    assert j1["status"] == "awaiting_client"

    # Create job 2 while job 1 is awaiting_client -> job 1 is cancelled, job 2 created
    j2 = (await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})).json()
    assert j2["status"] == "awaiting_client"
    assert j2["id"] != j1["id"]

    # Verify job 1 was cancelled
    check_j1 = (await client.get(f"/api/v1/editor/jobs/{j1['id']}", headers=editor)).json()
    assert check_j1["status"] == "cancelled"

    # Claim job 2
    claimed2 = (await client.post(f"/api/v1/editor/jobs/{j2['id']}/claim", headers=editor, json={})).json()
    assert claimed2["job"]["status"] == "claimed"

    # Attempt new prepare while job 2 is claimed -> 409 PROJ_BAKE_IN_PROGRESS
    blocked = await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "PROJ_BAKE_IN_PROGRESS"


@pytest.mark.asyncio
async def test_prepare_complete_fails_when_raw_model_deleted(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """Complete when raw model deleted transitions job to failed with 409 EDITOR_MODEL_CHANGED."""
    fake = FakeStorage().install(monkeypatch)
    project_id, raw_asset, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )

    prepare_res = await client.post(f"/api/v1/editor/projects/{project_id}/prepare", headers=editor, json={"cropBox": CROP})
    job_id = prepare_res.json()["id"]
    claimed = (await client.post(f"/api/v1/editor/jobs/{job_id}/claim", headers=editor, json={})).json()
    stg = claimed["payload"]["outputs"][0]["file_path"]
    fake.objects[stg] = GLB_BYTES

    # Delete the raw asset
    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    await project_repo.set_canonical_asset(db, project, None)
    await project_asset_repo.delete(db, raw_asset)
    await db.commit()

    # Attempt complete
    comp = await client.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": claimed["claimToken"]},
        json={"outputs": [{"format": "glb", "filePath": stg, "fileSizeBytes": len(GLB_BYTES)}]},
    )
    assert comp.status_code == 409
    assert comp.json()["code"] == "EDITOR_MODEL_CHANGED"

    # Job is now failed
    job_res = (await client.get(f"/api/v1/editor/jobs/{job_id}", headers=editor)).json()
    assert job_res["status"] == "failed"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "crop_box",
    [
        {},  # centre and size are required
        {**CROP, "size": {"x": 0.0, "y": 1.0, "z": 1.0}},  # degenerate box
        {**CROP, "center": {"x": 0.9, "y": 0.0, "z": 0.0}},  # outside normalized space
        {**CROP, "coordinateSpace": "world"},
        {**CROP, "extra": "field"},
    ],
)
async def test_prepare_rejects_crop_boxes_the_sidecar_would_reject(
    crop_box, client, db, auth_headers, authenticated_user, monkeypatch
):
    """Validated at the API so a claimed job never dies on the desktop for bad input."""
    FakeStorage().install(monkeypatch)
    project_id, _raw, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )
    response = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=editor,
        json={"cropBox": crop_box},
    )
    assert response.status_code == 422
    assert await bake_job_repo.get_active_for_project(db, uuid.UUID(project_id)) is None


@pytest.mark.asyncio
async def test_design_without_decal_layers_needs_no_reset_confirmation(
    client, db, auth_headers, authenticated_user, monkeypatch, service_headers
):
    """OD-1 only guards designs that would lose sticker/text layers."""
    FakeStorage().install(monkeypatch)
    project_id, _raw, editor = await _create_project_with_raw_model(
        client, db, auth_headers, authenticated_user
    )
    saved = await client.put(
        f"/api/v1/projects/{project_id}/design",
        headers=service_headers,
        json={"design_config": {"baseColor": "#FFFFFF"}, "base_revision": 0},
    )
    assert saved.status_code == 200, saved.text

    response = await client.post(
        f"/api/v1/editor/projects/{project_id}/prepare",
        headers=editor,
        json={"cropBox": CROP},
    )
    assert response.status_code == 202, response.text
