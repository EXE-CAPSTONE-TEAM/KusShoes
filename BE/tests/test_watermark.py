"""BR-65 Free-tier watermark (SRS_v2.2.txt:1910) with the BR-67 size cap (SRS_v2.2.txt:1922)."""

import io
import uuid
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from app.config import settings
from app.infrastructure.storage import ObjectDownload
from app.utils.jwt import create_access_token
from app.utils.watermark import stamp
from tests.job_helpers import GLB_BYTES, ZIP_BYTES, FakeStorage, attach_ready_model

SRS_FREE_MAX_EDGE_PX = 1080  # SRS_v2.2.txt:1922 "cạnh dài ≤1080px"


def _png(width: int, height: int, color=(40, 90, 160)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


async def _set_tier(db, user_id, tier: str, cycle: str | None) -> None:
    from app.repositories import plan_repo, subscription_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, tier, cycle)
    subscription = await subscription_repo.get_by_user(db, user_id)
    subscription.plan_id = plan.id
    subscription.plan = plan
    subscription.tier = f"{tier}_{cycle}" if cycle else tier
    await db.commit()


async def _project(db, user_id, *, thumbnail_path: str | None):
    from app.repositories import project_repo

    project = await project_repo.create(db, user_id=user_id, name="Render", description=None)
    project.thumbnail_path = thumbnail_path
    await db.commit()
    return project


def _serve_object(monkeypatch, data: bytes, content_type: str = "image/png") -> list[str]:
    """Stand in for MinIO: every open_object_download returns ``data``."""
    from app.infrastructure import storage

    requested: list[str] = []

    class _Body:
        def __init__(self):
            self._stream = io.BytesIO(data)

        def read(self, size: int) -> bytes:
            return self._stream.read(size)

        def close(self) -> None:
            self._stream.close()

    def fake_open(path: str) -> ObjectDownload:
        requested.append(path)
        return ObjectDownload(body=_Body(), size_bytes=len(data), content_type=content_type)

    monkeypatch.setattr(storage, "open_object_download", fake_open)
    return requested


# --- policy ---


@pytest.mark.asyncio
async def test_policy_required_for_free_and_missing_subscription(db, authenticated_user):
    from app.repositories import subscription_repo
    from app.services import watermark_service

    free = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert free.tier == "free"
    for subscription in (free, None):
        policy = watermark_service.policy_for(subscription)
        assert policy["required"] is True
        assert policy["text"] == settings.WATERMARK_TEXT
        assert policy["max_edge_px"] == settings.WATERMARK_FREE_MAX_EDGE_PX
        assert policy["opacity_percent"] == settings.WATERMARK_OPACITY_PERCENT


@pytest.mark.asyncio
async def test_policy_not_required_for_paid_tiers(db, authenticated_user):
    from app.repositories import subscription_repo
    from app.services import watermark_service

    for tier in ("basic", "pro"):
        await _set_tier(db, authenticated_user.id, tier, "monthly")
        subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
        assert subscription.tier == f"{tier}_monthly"
        assert watermark_service.policy_for(subscription)["required"] is False


@pytest.mark.asyncio
async def test_watermark_policy_endpoint_reflects_owner_tier(
    client, db, auth_headers, authenticated_user
):
    project = await _project(db, authenticated_user.id, thumbnail_path=None)
    free = await client.get(f"/api/v1/projects/{project.id}/watermark-policy", headers=auth_headers)
    assert free.status_code == 200
    assert free.json() == {
        "required": True,
        "text": settings.WATERMARK_TEXT,
        "max_edge_px": settings.WATERMARK_FREE_MAX_EDGE_PX,
        "opacity_percent": settings.WATERMARK_OPACITY_PERCENT,
    }
    await _set_tier(db, authenticated_user.id, "basic", "monthly")
    paid = await client.get(f"/api/v1/projects/{project.id}/watermark-policy", headers=auth_headers)
    assert paid.json()["required"] is False


# --- bake payload + export_records ---


async def _run_bake(db, user_id, monkeypatch, *, watermark_applied=True) -> tuple[dict, uuid.UUID]:
    """Claim and complete a desktop bake against fake storage; return (payload, project_id)."""
    from app.repositories import bake_job_repo, project_repo
    from app.schemas.editor import EditorJobCompleteRequest
    from app.services import job_service, quota_service

    fake = FakeStorage().install(monkeypatch)
    # Free has 0 exports/cycle (BR-99); these tests exercise the watermark rule, not quota.
    monkeypatch.setattr(quota_service, "assert_export_quota", AsyncMock())

    project = await project_repo.create(db, user_id=user_id, name="Bake", description=None)
    await db.commit()
    source = await attach_ready_model(db, project.id, user_id)
    job = await bake_job_repo.create(
        db,
        project_id=project.id,
        design_config={"color": "red"},
        priority="low",
        source_asset_id=source.id,
    )
    await db.commit()

    claimed = await job_service.claim(db, job.id, project=project, device_label="test")
    outputs = []
    for output in claimed.payload["outputs"]:
        data = GLB_BYTES if output["format"] == "glb" else ZIP_BYTES
        fake.objects[output["file_path"]] = data
        outputs.append(
            {"format": output["format"], "filePath": output["file_path"], "fileSizeBytes": len(data)}
        )
    await job_service.complete(
        db,
        job.id,
        claimed.claim_token,
        EditorJobCompleteRequest(outputs=outputs, watermarkApplied=watermark_applied),
    )
    return claimed.payload, project.id


@pytest.mark.asyncio
async def test_bake_payload_carries_watermark_block(db, authenticated_user, monkeypatch):
    free_payload, _ = await _run_bake(db, authenticated_user.id, monkeypatch)
    assert free_payload["watermark"]["required"] is True
    assert free_payload["watermark"]["text"] == settings.WATERMARK_TEXT
    assert free_payload["watermark"]["opacity_percent"] == settings.WATERMARK_OPACITY_PERCENT
    # The 2D thumbnail knob stays server-side; the sidecar schema forbids unknown keys.
    assert "max_edge_px" not in free_payload["watermark"]
    assert settings.WATERMARK_FREE_MAX_EDGE_PX == SRS_FREE_MAX_EDGE_PX

    await _set_tier(db, authenticated_user.id, "basic", "monthly")
    paid_payload, _ = await _run_bake(db, authenticated_user.id, monkeypatch)
    assert paid_payload["watermark"]["required"] is False


@pytest.mark.asyncio
async def test_free_bake_without_watermark_is_rejected(db, authenticated_user, monkeypatch):
    from app.exceptions import JobOutputInvalid

    with pytest.raises(JobOutputInvalid):
        await _run_bake(db, authenticated_user.id, monkeypatch, watermark_applied=False)


@pytest.mark.asyncio
async def test_export_record_persists_is_watermarked(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    from app.repositories import export_record_repo

    _, free_project = await _run_bake(db, authenticated_user.id, monkeypatch)
    await _set_tier(db, authenticated_user.id, "basic", "monthly")
    _, paid_project = await _run_bake(db, authenticated_user.id, monkeypatch, watermark_applied=False)

    free_records = await export_record_repo.list_for_project(db, free_project)
    paid_records = await export_record_repo.list_for_project(db, paid_project)
    assert free_records and paid_records
    assert all(r.is_watermarked is True for r in free_records)
    assert all(r.is_watermarked is False for r in paid_records)

    history = await client.get("/api/v1/exports", headers=auth_headers)
    assert history.status_code == 200
    flags = {item["id"]: item["is_watermarked"] for item in history.json()["items"]}
    for record in free_records:
        assert flags[str(record.id)] is True
    for record in paid_records:
        assert flags[str(record.id)] is False


# --- stamper (pure function) ---


def test_stamp_downscales_long_edge_to_1080():
    source = _png(2000, 1200)
    output = stamp(source, text="KusShoes", max_edge_px=SRS_FREE_MAX_EDGE_PX, opacity_percent=settings.WATERMARK_OPACITY_PERCENT)
    assert output != source
    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "PNG"
        assert max(image.size) == SRS_FREE_MAX_EDGE_PX
        assert image.size == (SRS_FREE_MAX_EDGE_PX, 648)  # aspect ratio 5:3 preserved


def test_stamp_does_not_upscale_small_image():
    source = _png(800, 600)
    output = stamp(source, text="KusShoes", max_edge_px=SRS_FREE_MAX_EDGE_PX, opacity_percent=settings.WATERMARK_OPACITY_PERCENT)
    with Image.open(io.BytesIO(output)) as image:
        assert image.size == (800, 600)
        stamped = image.convert("RGB")
    with Image.open(io.BytesIO(source)) as original:
        # The mark really is drawn: pixels differ from the unstamped image.
        assert stamped.tobytes() != original.convert("RGB").tobytes()


def test_stamp_rejects_invalid_parameters():
    source = _png(10, 10)
    with pytest.raises(ValueError):
        stamp(source, text=" ", max_edge_px=SRS_FREE_MAX_EDGE_PX, opacity_percent=settings.WATERMARK_OPACITY_PERCENT)
    with pytest.raises(ValueError):
        stamp(source, text="KusShoes", max_edge_px=0, opacity_percent=settings.WATERMARK_OPACITY_PERCENT)
    with pytest.raises(ValueError):
        stamp(source, text="KusShoes", max_edge_px=SRS_FREE_MAX_EDGE_PX, opacity_percent=0)


# --- GET /projects/{id}/preview-image ---


@pytest.mark.asyncio
async def test_preview_image_is_stamped_for_free_owner(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    stored = _png(2000, 1200)
    requested = _serve_object(monkeypatch, stored)
    project = await _project(db, authenticated_user.id, thumbnail_path="thumbs/free.png")

    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content != stored
    assert requested == ["thumbs/free.png"]
    with Image.open(io.BytesIO(response.content)) as image:
        assert max(image.size) == settings.WATERMARK_FREE_MAX_EDGE_PX
        served = image.convert("RGB")
    # A resize alone is not a watermark: the response must differ from a plain downscale.
    with Image.open(io.BytesIO(stored)) as source:
        plain = source.convert("RGB")
        plain.thumbnail(
            (settings.WATERMARK_FREE_MAX_EDGE_PX, settings.WATERMARK_FREE_MAX_EDGE_PX),
            Image.Resampling.LANCZOS,
        )
    assert served.size == plain.size
    assert served.tobytes() != plain.tobytes()


@pytest.mark.asyncio
async def test_preview_image_below_cap_is_stamped_without_resize(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    """BR-65 (SRS_v2.2.txt:1910): below the BR-67 cap nothing is resized, so any pixel change
    can only come from the watermark itself."""
    width, height = 800, 600
    assert max(width, height) < settings.WATERMARK_FREE_MAX_EDGE_PX
    stored = _png(width, height)
    _serve_object(monkeypatch, stored)
    project = await _project(db, authenticated_user.id, thumbnail_path="thumbs/small.png")

    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(response.content)) as image:
        assert image.size == (width, height)
        served = image.convert("RGB").tobytes()
    with Image.open(io.BytesIO(stored)) as source:
        original = source.convert("RGB").tobytes()
    assert served != original


@pytest.mark.asyncio
async def test_preview_image_is_untouched_for_paid_owner(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    stored = _png(2000, 1200)
    _serve_object(monkeypatch, stored)
    await _set_tier(db, authenticated_user.id, "basic", "monthly")
    project = await _project(db, authenticated_user.id, thumbnail_path="thumbs/basic.png")

    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == stored
    with Image.open(io.BytesIO(response.content)) as served, Image.open(io.BytesIO(stored)) as source:
        assert served.size == source.size
        assert served.convert("RGB").tobytes() == source.convert("RGB").tobytes()

    # Below the cap too: a paid owner's small render is served pixel-identical, never stamped.
    small = _png(800, 600)
    _serve_object(monkeypatch, small)
    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=auth_headers)
    assert response.content == small
    with Image.open(io.BytesIO(response.content)) as served, Image.open(io.BytesIO(small)) as source:
        assert served.convert("RGB").tobytes() == source.convert("RGB").tobytes()


@pytest.mark.asyncio
async def test_preview_image_409_without_thumbnail(client, db, auth_headers, authenticated_user):
    project = await _project(db, authenticated_user.id, thumbnail_path=None)
    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=auth_headers)
    assert response.status_code == 409
    assert response.json()["code"] == "RENDER_IMAGE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_preview_image_denied_for_non_owner(
    client, db, authenticated_user, monkeypatch
):
    from app.repositories import user_repo

    requested = _serve_object(monkeypatch, _png(100, 100))
    project = await _project(db, authenticated_user.id, thumbnail_path="thumbs/owner.png")
    other = await user_repo.create_email_user(
        db,
        email="intruder@example.com",
        username="intruder",
        password_hash="x",
        first_name="In",
        last_name="Truder",
    )
    other.is_verified = True
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(other.id))}"}

    response = await client.get(f"/api/v1/projects/{project.id}/preview-image", headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "PROJ_ACCESS_DENIED"
    assert "image" not in response.headers["content-type"]
    assert requested == []  # storage was never touched

    policy = await client.get(f"/api/v1/projects/{project.id}/watermark-policy", headers=headers)
    assert policy.status_code == 403
