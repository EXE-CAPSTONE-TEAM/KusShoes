"""BR-20 data import from a KusShoes backup (SRS_v2.2.txt:1510) with the BR-46 cap (:1799)."""

import hashlib
import hmac
import io
import json
import zipfile

import pytest

from app.config import settings
from app.infrastructure.storage import ObjectDownload, ObjectMetadata
from app.utils.jwt import create_access_token

MSG08 = "Tệp sao lưu không hợp lệ hoặc vượt hạn mức dự án của gói hiện tại."  # SRS_v2.2.txt:2236
BACKUP_MEMBERS = ("profile.json", "projects.json", "consents.json", "login_history.json")


# --- helpers ---


async def _create_projects(client, headers, names: list[str]) -> list[dict]:
    created = []
    for name in names:
        response = await client.post("/api/v1/projects", headers=headers, json={"name": name})
        assert response.status_code == 201, response.text
        created.append(response.json())
    return created


async def _export_zip(client, headers, mock_storage_upload) -> bytes:
    mock_storage_upload.reset_mock()
    response = await client.post("/api/v1/users/me/data-export", headers=headers)
    assert response.status_code == 200, response.text
    path, data, content_type = mock_storage_upload.call_args.args
    assert content_type == "application/zip"
    return data


def _serve_upload(monkeypatch, data: bytes) -> None:
    """Stand in for MinIO: the uploaded backup object holds ``data``."""
    from app.infrastructure import storage

    class _Body:
        def __init__(self):
            self._stream = io.BytesIO(data)

        def read(self, size: int) -> bytes:
            return self._stream.read(size)

        def close(self) -> None:
            self._stream.close()

    monkeypatch.setattr(
        storage,
        "get_object_metadata",
        lambda path: ObjectMetadata(size_bytes=len(data), content_type="application/zip"),
    )
    monkeypatch.setattr(
        storage,
        "open_object_download",
        lambda path: ObjectDownload(body=_Body(), size_bytes=len(data), content_type="application/zip"),
    )


def _members(archive_bytes: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def _rezip(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buffer.getvalue()


async def _start_import(client, headers) -> str:
    response = await client.post("/api/v1/users/me/data-import/upload-url", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["import_id"]


async def _import(client, headers, monkeypatch, archive_bytes: bytes):
    import_id = await _start_import(client, headers)
    _serve_upload(monkeypatch, archive_bytes)
    response = await client.post(
        f"/api/v1/users/me/data-import/{import_id}/confirm", headers=headers
    )
    return import_id, response


async def _import_row(db, import_id: str):
    from sqlalchemy import select

    from app.models.data_import import DataImport

    result = await db.execute(
        select(DataImport)
        .where(DataImport.id == import_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _live_projects(db, user_id):
    from sqlalchemy import select

    from app.models.project import Project

    result = await db.execute(
        select(Project)
        .where(Project.user_id == user_id, Project.deleted_at.is_(None))
        .execution_options(populate_existing=True)
    )
    return list(result.scalars())


def _assert_rejected(response, reason: str) -> None:
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["code"] == "DATA_IMPORT_INVALID"
    assert body["message"] == MSG08
    assert body["reason"] == reason


# --- manifest ---


@pytest.mark.asyncio
async def test_export_zip_contains_valid_manifest(client, auth_headers, mock_storage_upload):
    await _create_projects(client, auth_headers, ["Giày A"])
    archive = await _export_zip(client, auth_headers, mock_storage_upload)
    members = _members(archive)

    assert set(members) == {*BACKUP_MEMBERS, "manifest.json"}
    with zipfile.ZipFile(io.BytesIO(archive)) as opened:
        assert opened.namelist()[-1] == "manifest.json"  # written last

    manifest = json.loads(members["manifest.json"])
    assert manifest["format"] == "kusshoes-backup"
    assert manifest["format_version"] == settings.DATA_BACKUP_FORMAT_VERSION
    assert manifest["account_code"]
    assert manifest["exported_at"]
    # Recompute independently of the service code.
    hashes = {name: hashlib.sha256(members[name]).hexdigest() for name in BACKUP_MEMBERS}
    assert manifest["files"] == hashes
    lines = "\n".join(f"{name}:{hashes[name]}" for name in sorted(hashes))
    checksum = hashlib.sha256(lines.encode()).hexdigest()
    assert manifest["checksum"] == checksum
    expected_signature = hmac.new(
        settings.SECRET_KEY.encode(), checksum.encode(), hashlib.sha256
    ).hexdigest()
    assert manifest["signature"] == expected_signature


# --- import ---


@pytest.mark.asyncio
async def test_export_import_round_trip(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    await _create_projects(client, auth_headers, ["Giày A"])
    archive = await _export_zip(client, auth_headers, mock_storage_upload)
    exported = json.loads(_members(archive)["projects.json"])

    import_id, response = await _import(client, auth_headers, monkeypatch, archive)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert body["projects_imported"] == len(exported) == 1
    assert body["skipped_binary_assets"] is True

    row = await _import_row(db, import_id)
    assert row.status == "completed"
    assert row.projects_imported == 1
    assert row.completed_at is not None
    assert row.file_size_bytes == len(archive)
    assert row.checksum == json.loads(_members(archive)["manifest.json"])["checksum"]
    assert len(await _live_projects(db, authenticated_user.id)) == 2

    history = await client.get("/api/v1/users/me/data-imports", headers=auth_headers)
    assert history.status_code == 200
    items = history.json()
    assert [item["id"] for item in items] == [import_id]
    assert items[0]["status"] == "completed"
    assert items[0]["projects_imported"] == 1

    again = await client.post(
        f"/api/v1/users/me/data-import/{import_id}/confirm", headers=auth_headers
    )
    _assert_rejected(again, "already_processed")


@pytest.mark.asyncio
async def test_tampered_payload_fails_checksum(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    await _create_projects(client, auth_headers, ["Giày A"])
    members = _members(await _export_zip(client, auth_headers, mock_storage_upload))
    tampered = bytearray(members["projects.json"])
    index = tampered.index(b"A")
    tampered[index] = ord("B")  # flip a single byte of the payload
    members["projects.json"] = bytes(tampered)

    import_id, response = await _import(client, auth_headers, monkeypatch, _rezip(members))
    _assert_rejected(response, "checksum_mismatch")
    row = await _import_row(db, import_id)
    assert row.status == "rejected"
    assert row.rejected_reason == "checksum_mismatch"
    assert len(await _live_projects(db, authenticated_user.id)) == 1


@pytest.mark.asyncio
async def test_forged_manifest_fails_signature(
    client, db, auth_headers, mock_storage_upload, monkeypatch
):
    await _create_projects(client, auth_headers, ["Giày A"])
    members = _members(await _export_zip(client, auth_headers, mock_storage_upload))
    members["projects.json"] = members["projects.json"].replace(b"Gi", b"Xi", 1)
    manifest = json.loads(members["manifest.json"])
    # The forger recomputes every hash and the aggregate checksum but cannot sign it.
    manifest["files"]["projects.json"] = hashlib.sha256(members["projects.json"]).hexdigest()
    lines = "\n".join(f"{n}:{manifest['files'][n]}" for n in sorted(manifest["files"]))
    manifest["checksum"] = hashlib.sha256(lines.encode()).hexdigest()
    members["manifest.json"] = json.dumps(manifest).encode()

    import_id, response = await _import(client, auth_headers, monkeypatch, _rezip(members))
    _assert_rejected(response, "signature_mismatch")
    assert (await _import_row(db, import_id)).status == "rejected"


@pytest.mark.asyncio
async def test_foreign_zip_is_rejected(client, db, auth_headers, monkeypatch):
    foreign = _rezip({"readme.txt": b"hello", "projects.json": b"[]"})
    import_id, response = await _import(client, auth_headers, monkeypatch, foreign)
    _assert_rejected(response, "not_a_kusshoes_backup")
    row = await _import_row(db, import_id)
    assert row.status == "rejected"
    assert row.rejected_reason == "not_a_kusshoes_backup"

    not_a_zip = b"definitely not a zip archive"
    _, response = await _import(client, auth_headers, monkeypatch, not_a_zip)
    _assert_rejected(response, "not_a_kusshoes_backup")


@pytest.mark.asyncio
async def test_import_blocked_by_project_quota_br46(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    from app.repositories import subscription_repo

    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "free"
    free_cap = subscription.plan.max_projects
    assert free_cap == 3  # BR-46 (SRS_v2.2.txt:1799) "Free 3"

    await _create_projects(client, auth_headers, ["Giày A", "Giày B"])
    archive = await _export_zip(client, auth_headers, mock_storage_upload)

    import_id, response = await _import(client, auth_headers, monkeypatch, archive)
    _assert_rejected(response, "project_quota_exceeded")
    body = response.json()
    assert (body["live"], body["limit"], body["incoming"]) == (2, free_cap, 2)
    assert len(await _live_projects(db, authenticated_user.id)) == 2  # nothing created
    row = await _import_row(db, import_id)
    assert (row.status, row.rejected_reason) == ("rejected", "project_quota_exceeded")


@pytest.mark.asyncio
async def test_import_creates_new_copies_and_never_overwrites(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    from app.repositories import project_repo

    kept, trashed = await _create_projects(client, auth_headers, ["Giày A", "Giày B"])
    saved = await client.put(
        f"/api/v1/projects/{kept['id']}/design",
        headers={"X-Service-Token": settings.SERVICE_TOKEN},
        json={"design_config": {"color": "red"}, "thumbnail_path": None, "base_revision": 0},
    )
    assert saved.status_code == 200, saved.text
    archive = await _export_zip(client, auth_headers, mock_storage_upload)

    # Leave exactly 1 live project: BR-46 does not count trashed projects.
    project = await project_repo.get_by_id(db, trashed["id"])
    await project_repo.soft_delete(db, project)
    await db.commit()

    before = {p.id: p for p in await _live_projects(db, authenticated_user.id)}
    assert len(before) == 1
    original = next(iter(before.values()))
    snapshot = (
        original.id, original.name, original.design_config, original.updated_at,
        original.current_design_revision, original.status,
    )

    _, response = await _import(client, auth_headers, monkeypatch, archive)
    assert response.status_code == 200, response.text
    assert response.json()["projects_imported"] == 2

    after = await _live_projects(db, authenticated_user.id)
    assert len(after) == 3
    unchanged = next(p for p in after if p.id == original.id)
    assert (
        unchanged.id, unchanged.name, unchanged.design_config, unchanged.updated_at,
        unchanged.current_design_revision, unchanged.status,
    ) == snapshot


@pytest.mark.asyncio
async def test_imported_projects_get_new_ids_and_suffix(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    original = (await _create_projects(client, auth_headers, ["Giày A"]))[0]
    await client.put(
        f"/api/v1/projects/{original['id']}/design",
        headers={"X-Service-Token": settings.SERVICE_TOKEN},
        json={"design_config": {"color": "blue"}, "thumbnail_path": "thumbs/a.png", "base_revision": 0},
    )
    archive = await _export_zip(client, auth_headers, mock_storage_upload)

    _, response = await _import(client, auth_headers, monkeypatch, archive)
    assert response.status_code == 200, response.text

    copies = [p for p in await _live_projects(db, authenticated_user.id) if str(p.id) != original["id"]]
    assert len(copies) == 1
    copy = copies[0]
    assert copy.name == "Giày A (nhập lại)"
    assert copy.design_config == {"color": "blue"}
    assert copy.status == "draft"
    assert copy.is_locked is False
    assert copy.canonical_model_asset_id is None
    assert copy.thumbnail_path is None


@pytest.mark.asyncio
async def test_imported_long_name_is_truncated_to_column_limit(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    from app.models.project import Project
    from app.services import data_import_service

    limit = Project.__table__.c.name.type.length
    projects = json.dumps([{"name": "N" * limit, "description": None, "design_config": None}])
    members = {name: b"[]" for name in BACKUP_MEMBERS}
    members["profile.json"] = b"{}"
    members["projects.json"] = projects.encode()
    manifest = data_import_service.build_manifest(members, account_code="X", exported_at="now")
    members["manifest.json"] = json.dumps(manifest).encode()

    _, response = await _import(client, auth_headers, monkeypatch, _rezip(members))
    assert response.status_code == 200, response.text
    (copy,) = await _live_projects(db, authenticated_user.id)
    assert len(copy.name) == limit
    assert copy.name.endswith(" (nhập lại)")


@pytest.mark.asyncio
async def test_import_failure_rolls_back_every_project(
    client, db, auth_headers, authenticated_user, mock_storage_upload, monkeypatch
):
    from app.services import quota_service

    user_id = authenticated_user.id  # the service rollback expires every loaded object
    await _create_projects(client, auth_headers, ["Giày A"])
    archive = await _export_zip(client, auth_headers, mock_storage_upload)

    async def boom(*args, **kwargs):
        raise RuntimeError("counter unavailable")

    monkeypatch.setattr(quota_service, "increment_projects", boom)
    import_id = await _start_import(client, auth_headers)
    _serve_upload(monkeypatch, archive)
    with pytest.raises(RuntimeError):
        await client.post(f"/api/v1/users/me/data-import/{import_id}/confirm", headers=auth_headers)

    assert len(await _live_projects(db, user_id)) == 1
    row = await _import_row(db, import_id)
    assert (row.status, row.rejected_reason) == ("rejected", "import_failed")


@pytest.mark.asyncio
async def test_oversized_upload_is_rejected(client, db, auth_headers, monkeypatch):
    from app.infrastructure import storage

    import_id = await _start_import(client, auth_headers)
    monkeypatch.setattr(
        storage,
        "get_object_metadata",
        lambda path: ObjectMetadata(
            size_bytes=settings.DATA_IMPORT_MAX_BYTES + 1, content_type="application/zip"
        ),
    )
    response = await client.post(
        f"/api/v1/users/me/data-import/{import_id}/confirm", headers=auth_headers
    )
    _assert_rejected(response, "too_large")
    assert (await _import_row(db, import_id)).rejected_reason == "too_large"


@pytest.mark.asyncio
async def test_upload_url_is_rate_limited(client, db, auth_headers, authenticated_user):
    for _ in range(settings.DATA_IMPORT_RATE_LIMIT):
        response = await client.post("/api/v1/users/me/data-import/upload-url", headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["storage_path"] == f"data-imports/{authenticated_user.id}/{body['import_id']}.zip"
        assert body["expires_in"] == settings.SIGNED_URL_TTL_SECONDS
        assert body["max_bytes"] == settings.DATA_IMPORT_MAX_BYTES

    blocked = await client.post("/api/v1/users/me/data-import/upload-url", headers=auth_headers)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "AUTH_RATE_LIMITED"

    history = await client.get("/api/v1/users/me/data-imports", headers=auth_headers)
    assert len(history.json()) == settings.DATA_IMPORT_RATE_LIMIT
    assert all(item["status"] == "pending" for item in history.json())


@pytest.mark.asyncio
async def test_confirm_rejects_foreign_import_id(client, db, auth_headers):
    from app.repositories import user_repo

    import_id = await _start_import(client, auth_headers)
    other = await user_repo.create_email_user(
        db,
        email="other-importer@example.com",
        username="otherimporter",
        password_hash="x",
        first_name="Other",
        last_name="Importer",
    )
    other.is_verified = True
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(other.id))}"}

    response = await client.post(f"/api/v1/users/me/data-import/{import_id}/confirm", headers=headers)
    assert response.status_code == 404
    assert response.json()["code"] == "DATA_IMPORT_NOT_FOUND"
    assert (await _import_row(db, import_id)).status == "pending"  # untouched
    other_history = await client.get("/api/v1/users/me/data-imports", headers=headers)
    assert other_history.json() == []
