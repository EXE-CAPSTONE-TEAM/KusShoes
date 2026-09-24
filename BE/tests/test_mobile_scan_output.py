"""Integration tests for mobile scan output landing as raw (spec §B.5, Ticket-10)."""
import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.config import settings
from app.infrastructure import storage
from app.infrastructure.storage import ObjectMetadata
from app.models.monthly_usage import MonthlyUsage
from app.repositories import plan_repo, project_asset_repo, project_repo, subscription_repo
from app.services.auth_service import EDITOR_SCOPES
from app.services.mobile_service import COMPLETION_PREFIX, _token_key
from app.utils.jwt import create_access_token, create_editor_access_token

BOOTSTRAP = "/api/v1/mobile/scans/bootstrap"
INTERNAL = "/api/v1/internal/mobile"
COMPUTE_TOKEN = "compute-test-token"
GLB_BYTES = b"glTF\x02\x00\x00\x00\x14\x00\x00\x00JSON{}\x00\x00"


@pytest.fixture(autouse=True)
def compute_configured(monkeypatch):
    monkeypatch.setattr(settings, "MOBILE_COMPUTE_URL", "http://compute.test")
    monkeypatch.setattr(settings, "MOBILE_COMPUTE_SERVICE_TOKEN", COMPUTE_TOKEN)


def _editor_headers(user_id: uuid.UUID, project_id: uuid.UUID | str) -> dict[str, str]:
    token = create_editor_access_token(str(user_id), str(project_id), list(EDITOR_SCOPES))
    return {"Authorization": f"Bearer {token}"}


async def _subscribe(db, user, tier: str = "basic") -> None:
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, "monthly")
    subscription = await subscription_repo.get_by_user(db, user.id)
    subscription.plan = plan
    subscription.tier = f"{tier}_monthly"
    subscription.status = "active"
    subscription.current_period_start = datetime.now(UTC) - timedelta(days=1)
    subscription.expires_at = subscription.current_period_start + timedelta(days=30)
    await db.commit()


async def _start_scan(client, user) -> tuple[str, str, str]:
    """Bootstrap a scan, claim the compute grant, and request output upload.

    Returns (project_id, completion_token, asset_id).
    """
    compute = {"X-Service-Token": COMPUTE_TOKEN}
    user_headers = {"Authorization": f"Bearer {create_access_token(str(user.id), role='user')}"}
    boot = await client.post(
        BOOTSTRAP,
        headers=user_headers,
        json={"client_request_id": str(uuid.uuid4()), "project_name": "Scan Shoe"},
    )
    assert boot.status_code == 201, boot.text
    project_id = boot.json()["project_id"]

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
    asset_id = upload.json()["asset_id"]
    return project_id, completion_token, asset_id


async def _confirm_scan(client, completion_token: str, asset_id: str, file_size: int = len(GLB_BYTES)):
    with (
        patch(
            "app.infrastructure.storage.get_object_metadata",
            return_value=ObjectMetadata(size_bytes=file_size, content_type="model/gltf-binary"),
        ),
        patch("app.infrastructure.storage.read_object_prefix", return_value=b"glTF"),
    ):
        return await client.post(
            f"{INTERNAL}/scans/output-confirm",
            headers={"X-Service-Token": COMPUTE_TOKEN},
            json={
                "completion_token": completion_token,
                "asset_id": asset_id,
                "file_size_bytes": file_size,
            },
        )


@pytest.mark.asyncio
async def test_output_confirm_creates_asset_with_raw_status(client, db, authenticated_user):
    """spec §B.5: confirm_output creates the asset with status='raw' (was hardcoded 'ready')."""
    user_id = authenticated_user.id
    await _subscribe(db, authenticated_user)
    project_id, completion_token, asset_id = await _start_scan(client, authenticated_user)

    # Asset was created during output-upload with status='uploading'
    asset = await project_asset_repo.get_by_id(db, uuid.UUID(asset_id))
    assert asset is not None
    assert asset.status == "uploading"
    assert asset.asset_type == "source_model"

    # Confirm the output
    done = await _confirm_scan(client, completion_token, asset_id)
    assert done.status_code == 200, done.text
    confirm_data = done.json()
    assert confirm_data["status"] == "raw"
    assert confirm_data["model_asset_id"] == asset_id
    assert confirm_data["project_id"] == project_id

    # Verify database state: asset status is 'raw'
    persisted_asset = await project_asset_repo.get_by_id(db, uuid.UUID(asset_id))
    assert persisted_asset is not None
    assert persisted_asset.status == "raw"
    assert persisted_asset.file_size_bytes == len(GLB_BYTES)

    # Project's canonical model asset is set to the raw asset
    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    assert project is not None
    assert project.canonical_model_asset_id == persisted_asset.id

    # Editor context exposes modelStatus='raw', rawModelAssetId, and modelAsset.status='raw'
    editor_hdrs = _editor_headers(user_id, project_id)
    ctx_res = await client.get(f"/api/v1/editor/projects/{project_id}/context", headers=editor_hdrs)
    assert ctx_res.status_code == 200, ctx_res.text
    context = ctx_res.json()
    assert context["modelStatus"] == "raw"
    assert context["rawModelAssetId"] == str(persisted_asset.id)
    assert context["modelAsset"] is not None
    assert context["modelAsset"]["status"] == "raw"
    assert context["modelAsset"]["id"] == str(persisted_asset.id)


@pytest.mark.asyncio
async def test_output_upload_retried_after_confirm_is_idempotent(
    client, db, redis, authenticated_user
):
    """spec §B.5: output-upload retried after confirm is idempotent, accepting 'raw' state."""
    await _subscribe(db, authenticated_user)
    project_id, completion_token, asset_id = await _start_scan(client, authenticated_user)

    # Confirm the output first
    done = await _confirm_scan(client, completion_token, asset_id)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "raw"

    compute = {"X-Service-Token": COMPUTE_TOKEN}

    # 1. Normal retry: Redis record status is 'completed'
    retry1 = await client.post(
        f"{INTERNAL}/scans/output-upload",
        headers=compute,
        json={"completion_token": completion_token},
    )
    assert retry1.status_code == 200, retry1.text
    data1 = retry1.json()
    assert data1["already_completed"] is True
    assert data1["upload_url"] is None
    assert data1["expires_in"] == 0
    assert data1["asset_id"] == asset_id
    assert data1["file_path"] == f"source_models/{project_id}/{asset_id}.glb"

    # 2. Redis status degraded/reset, but asset in DB is 'raw':
    # create_output_upload must accept 'raw' and return already_completed=True
    token_key = _token_key(COMPLETION_PREFIX, completion_token)
    raw_record = await redis.get(token_key)
    assert raw_record is not None
    record = json.loads(raw_record)
    record["status"] = "in_progress"
    await redis.set(token_key, json.dumps(record), ex=3600)

    retry2 = await client.post(
        f"{INTERNAL}/scans/output-upload",
        headers=compute,
        json={"completion_token": completion_token},
    )
    assert retry2.status_code == 200, retry2.text
    data2 = retry2.json()
    assert data2["already_completed"] is True
    assert data2["upload_url"] is None
    assert data2["expires_in"] == 0
    assert data2["asset_id"] == asset_id


@pytest.mark.asyncio
async def test_output_confirm_retried_after_confirm_is_idempotent(client, db, authenticated_user):
    """confirm_output called multiple times returns raw status and does not double charge."""
    user_id = authenticated_user.id
    await _subscribe(db, authenticated_user)
    project_id, completion_token, asset_id = await _start_scan(client, authenticated_user)

    # First confirm
    done1 = await _confirm_scan(client, completion_token, asset_id)
    assert done1.status_code == 200, done1.text
    assert done1.json()["status"] == "raw"

    # Second confirm (retry)
    done2 = await _confirm_scan(client, completion_token, asset_id)
    assert done2.status_code == 200, done2.text
    assert done2.json()["status"] == "raw"

    # Verify quota used: exactly 1 scan used
    rows = (
        await db.execute(
            select(MonthlyUsage.scans_used).where(MonthlyUsage.user_id == user_id)
        )
    ).all()
    assert sum(row[0] for row in rows) == 1


@pytest.mark.asyncio
async def test_web_confirm_upload_still_yields_ready(client, db, auth_headers, authenticated_user, monkeypatch):
    """spec §B.5: web confirm_upload is unchanged (web uploads stay 'ready')."""
    user_id = authenticated_user.id
    # 1. Project assets route: POST /api/v1/projects/{project_id}/assets/upload-url + confirm
    created = await client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "Web Model Project"},
    )
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]

    monkeypatch.setattr(
        storage,
        "generate_presigned_upload_url",
        lambda path, *_a, **_k: f"https://r2/put/{path}",
    )
    monkeypatch.setattr(
        storage,
        "get_object_metadata",
        lambda path: ObjectMetadata(size_bytes=len(GLB_BYTES), content_type="model/gltf-binary"),
    )
    monkeypatch.setattr(
        storage,
        "read_object_prefix",
        lambda path, length=512: GLB_BYTES[:length],
    )

    url_res = await client.post(
        f"/api/v1/projects/{project_id}/assets/upload-url",
        headers=auth_headers,
        json={
            "asset_type": "source_model",
            "filename": "model.glb",
            "content_type": "model/gltf-binary",
        },
    )
    assert url_res.status_code == 200, url_res.text
    asset_id = url_res.json()["asset_id"]

    confirm_res = await client.post(
        f"/api/v1/projects/{project_id}/assets/confirm",
        headers=auth_headers,
        json={"asset_id": asset_id, "file_size_bytes": len(GLB_BYTES)},
    )
    assert confirm_res.status_code == 200, confirm_res.text
    assert confirm_res.json()["status"] == "ready"

    # Verify DB asset status is 'ready'
    asset = await project_asset_repo.get_by_id(db, uuid.UUID(asset_id))
    assert asset is not None
    assert asset.status == "ready"

    # Project canonical asset points to this ready model
    project = await project_repo.get_by_id(db, uuid.UUID(project_id))
    assert project is not None
    assert project.canonical_model_asset_id == asset.id

    # 2. Editor route: POST /api/v1/editor/assets/upload-url + confirm (e.g. sticker upload)
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    monkeypatch.setattr(
        storage,
        "get_object_metadata",
        lambda path: ObjectMetadata(size_bytes=len(png_bytes), content_type="image/png"),
    )
    monkeypatch.setattr(
        storage,
        "read_object_prefix",
        lambda path, length=512: png_bytes[:length],
    )
    editor_hdrs = _editor_headers(user_id, project_id)
    editor_url_res = await client.post(
        "/api/v1/editor/assets/upload-url",
        headers=editor_hdrs,
        json={
            "asset_type": "sticker",
            "filename": "logo.png",
            "content_type": "image/png",
        },
    )
    assert editor_url_res.status_code == 200, editor_url_res.text
    asset_id2 = editor_url_res.json()["asset_id"]

    editor_confirm_res = await client.post(
        "/api/v1/editor/assets/confirm",
        headers=editor_hdrs,
        json={"asset_id": asset_id2, "file_size_bytes": len(png_bytes)},
    )
    assert editor_confirm_res.status_code == 200, editor_confirm_res.text
    assert editor_confirm_res.json()["status"] == "ready"

    asset2 = await project_asset_repo.get_by_id(db, uuid.UUID(asset_id2))
    assert asset2 is not None
    assert asset2.status == "ready"

    # Editor context exposes modelStatus='ready'
    ctx_res = await client.get(f"/api/v1/editor/projects/{project_id}/context", headers=editor_hdrs)
    assert ctx_res.status_code == 200, ctx_res.text
    context = ctx_res.json()
    assert context["modelStatus"] == "ready"
    assert context["modelAsset"]["status"] == "ready"


@pytest.mark.asyncio
async def test_output_upload_before_confirm_is_idempotent(client, db, authenticated_user):
    """Calling output-upload multiple times before confirm returns the same asset_id and upload url."""
    await _subscribe(db, authenticated_user)
    compute = {"X-Service-Token": COMPUTE_TOKEN}
    user_headers = {"Authorization": f"Bearer {create_access_token(str(authenticated_user.id), role='user')}"}

    boot = await client.post(
        BOOTSTRAP,
        headers=user_headers,
        json={"client_request_id": str(uuid.uuid4())},
    )
    assert boot.status_code == 201, boot.text
    claim = await client.post(
        f"{INTERNAL}/compute-grants/claim",
        headers=compute,
        json={"compute_grant": boot.json()["compute_grant"]},
    )
    completion_token = claim.json()["completion_token"]

    with patch(
        "app.infrastructure.storage.generate_presigned_upload_url",
        return_value="http://storage.test/upload",
    ):
        up1 = await client.post(
            f"{INTERNAL}/scans/output-upload",
            headers=compute,
            json={"completion_token": completion_token},
        )
        up2 = await client.post(
            f"{INTERNAL}/scans/output-upload",
            headers=compute,
            json={"completion_token": completion_token},
        )

    assert up1.status_code == 200, up1.text
    assert up2.status_code == 200, up2.text
    assert up1.json()["asset_id"] == up2.json()["asset_id"]
    assert up1.json()["already_completed"] is False
    assert up2.json()["already_completed"] is False
