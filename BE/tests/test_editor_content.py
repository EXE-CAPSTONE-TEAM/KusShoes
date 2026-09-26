"""Editor content endpoints hand out presigned R2 URLs instead of streaming bytes (Ticket-03)."""
import uuid

import pytest

from app.config import settings
from app.infrastructure import storage
from app.models.export_record import ExportRecord
from app.models.project_asset import ProjectAsset
from app.repositories import bake_job_repo, export_record_repo
from app.services.auth_service import EDITOR_SCOPES
from app.utils.jwt import create_editor_access_token
from tests.job_helpers import attach_ready_model


@pytest.fixture
def presign(monkeypatch):
    """Record every presign call; return a URL that encodes its inputs."""
    calls: list[dict] = []

    def fake(file_path, ttl=3600, *, content_disposition=None):
        calls.append({"path": file_path, "ttl": ttl, "disposition": content_disposition})
        return f"https://r2.test/{file_path}?ttl={ttl}"

    monkeypatch.setattr(storage, "generate_presigned_download_url", fake)
    return calls


async def _editor(client, db, auth_headers, user):
    created = await client.post("/api/v1/projects", headers=auth_headers, json={"name": "Shoe"})
    project_id = created.json()["id"]
    token = create_editor_access_token(str(user.id), project_id, list(EDITOR_SCOPES))
    return project_id, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["ready", "raw"])
async def test_source_model_content_is_a_presigned_url(
    status, client, db, auth_headers, authenticated_user, presign
):
    project_id, editor = await _editor(client, db, auth_headers, authenticated_user)
    asset = await attach_ready_model(db, project_id, authenticated_user.id, status=status)

    response = await client.get(f"/api/v1/editor/assets/{asset.id}/content", headers=editor)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert body["url"].startswith(f"https://r2.test/{asset.file_path}")
    assert 0 < body["expiresIn"] <= settings.SIGNED_URL_TTL_SECONDS
    assert body["contentType"] == "model/gltf-binary"
    assert presign[-1]["ttl"] == body["expiresIn"]
    assert presign[-1]["disposition"].startswith("inline;")


@pytest.mark.asyncio
async def test_unfinished_or_foreign_assets_are_not_served(
    client, db, auth_headers, authenticated_user, presign
):
    project_id, editor = await _editor(client, db, auth_headers, authenticated_user)
    uploading = ProjectAsset(
        project_id=uuid.UUID(project_id),
        user_id=authenticated_user.id,
        asset_type="sticker",
        file_path="assets/pending.png",
        mime_type="image/png",
        status="uploading",
    )
    db.add(uploading)
    await db.commit()
    other_project, _ = await _editor(client, db, auth_headers, authenticated_user)
    foreign = await attach_ready_model(db, other_project, authenticated_user.id)

    pending = await client.get(f"/api/v1/editor/assets/{uploading.id}/content", headers=editor)
    cross = await client.get(f"/api/v1/editor/assets/{foreign.id}/content", headers=editor)

    assert pending.status_code == 404
    assert cross.status_code == 404
    assert presign == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("export_format", "suffix", "content_type"),
    [("glb", ".glb", "model/gltf-binary"), ("obj", ".zip", "application/zip")],
)
async def test_export_content_is_an_attachment_url(
    export_format,
    suffix,
    content_type,
    client,
    db,
    auth_headers,
    authenticated_user,
    presign,
):
    project_id, editor = await _editor(client, db, auth_headers, authenticated_user)
    job = await bake_job_repo.create(
        db, project_id=uuid.UUID(project_id), design_config={"color": "red"}, priority="low"
    )
    job.status = "completed"
    record = ExportRecord(
        project_id=uuid.UUID(project_id),
        bake_job_id=job.id,
        user_id=authenticated_user.id,
        format=export_format,
        file_path=f"exports/{project_id}/{job.id}/final_shoe{suffix}",
        file_size_bytes=10,
    )
    db.add(record)
    await db.commit()

    response = await client.get(f"/api/v1/editor/exports/{record.id}/content", headers=editor)

    assert response.status_code == 200
    body = response.json()
    assert body["filename"].endswith(suffix)
    assert body["contentType"] == content_type
    assert body["expiresIn"] <= settings.SIGNED_URL_TTL_SECONDS
    assert presign[-1]["disposition"] == f'attachment; filename="{body["filename"]}"'
    refreshed = await export_record_repo.get_for_user(db, record.id, authenticated_user.id)
    await db.refresh(refreshed)
    assert refreshed.download_count == 1
