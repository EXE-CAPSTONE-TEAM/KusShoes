"""BR-20 data import from a KusShoes backup (UC-07).

BR-20 (SRS_v2.2.txt:1510): "Chỉ nhập được tệp sao lưu do KusShoes xuất (kiểm tra checksum). Dữ
liệu nhập được tạo thành bản sao mới, không ghi đè, và tính vào hạn mức dự án (BR-46)."
BR-46 (SRS_v2.2.txt:1799): project cap per plan; trashed projects do not count.
Rejections answer MSG08 (SRS_v2.2.txt:2236) through ``DataImportInvalid``.

"Do KusShoes xuất" is proven with a keyed checksum: the BR-19 export (``user_service``) writes a
``manifest.json`` holding the sha256 of every member, an aggregate checksum over them and an
HMAC-SHA256 of that checksum under ``settings.SECRET_KEY``. A bare checksum could be recomputed
by anyone; the HMAC cannot.

The BR-19 export contains project metadata only (``project_repo.list_for_user`` already excludes
trashed projects, and no GLB/texture binaries are bundled), so every ``projects.json`` entry is
importable and binary assets are never restored.
"""

import hashlib
import hmac
import io
import json
import uuid
import zipfile
import zlib
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import AuthRateLimited, DataImportInvalid, DataImportNotFound
from app.infrastructure import rate_limiter, storage
from app.models.project import Project
from app.repositories import data_import_repo, project_repo, subscription_repo
from app.schemas.data_transfer import (
    DataImportHistoryItem,
    DataImportResultResponse,
    DataImportUploadResponse,
)
from app.services import quota_service

BACKUP_FORMAT = "kusshoes-backup"
MANIFEST_MEMBER = "manifest.json"
PROFILE_MEMBER = "profile.json"
PROJECTS_MEMBER = "projects.json"
CONSENTS_MEMBER = "consents.json"
LOGIN_HISTORY_MEMBER = "login_history.json"
BACKUP_MEMBERS = (PROFILE_MEMBER, PROJECTS_MEMBER, CONSENTS_MEMBER, LOGIN_HISTORY_MEMBER)
BACKUP_CONTENT_TYPE = "application/zip"
RATE_LIMIT_BUCKET = "data-import"
# BR-20 "bản sao mới, không ghi đè": the copy is visibly marked as re-imported.
IMPORTED_NAME_SUFFIX = " (nhập lại)"
_PROJECT_NAME_MAX = Project.__table__.c.name.type.length

# Rejection reasons (returned in the MSG08 error body as ``reason``).
REASON_ALREADY_PROCESSED = "already_processed"
REASON_UPLOAD_MISSING = "upload_missing"
REASON_TOO_LARGE = "too_large"
REASON_NOT_A_BACKUP = "not_a_kusshoes_backup"
REASON_CHECKSUM = "checksum_mismatch"
REASON_SIGNATURE = "signature_mismatch"
REASON_QUOTA = "project_quota_exceeded"
REASON_IMPORT_FAILED = "import_failed"

# No SRS MSG code exists for a successful import; this restates BR-20 (SRS_v2.2.txt:1510)
# "Dữ liệu nhập được tạo thành bản sao mới".
IMPORT_COMPLETED_MESSAGE = "Dữ liệu nhập đã được tạo thành bản sao mới"


# --- manifest (shared with the BR-19 export in user_service) ---


def file_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def aggregate_checksum(file_hashes: dict[str, str]) -> str:
    """sha256 over the sorted ``name:sha256`` lines joined by newlines."""
    lines = "\n".join(f"{name}:{file_hashes[name]}" for name in sorted(file_hashes))
    return hashlib.sha256(lines.encode()).hexdigest()


def sign_checksum(checksum: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), checksum.encode(), hashlib.sha256).hexdigest()


def build_manifest(members: dict[str, bytes], *, account_code: str, exported_at: str) -> dict:
    file_hashes = {name: file_digest(data) for name, data in members.items()}
    checksum = aggregate_checksum(file_hashes)
    return {
        "format": BACKUP_FORMAT,
        "format_version": settings.DATA_BACKUP_FORMAT_VERSION,
        "exported_at": exported_at,
        "account_code": account_code,
        "files": file_hashes,
        "checksum": checksum,
        "signature": sign_checksum(checksum),
    }


# --- endpoints ---


async def create_upload_url(
    db: AsyncSession, redis: aioredis.Redis, user
) -> DataImportUploadResponse:
    retry_after = await rate_limiter.consume(
        redis,
        bucket=RATE_LIMIT_BUCKET,
        identifier=str(user.id),
        limit=settings.DATA_IMPORT_RATE_LIMIT,
        window_seconds=settings.DATA_IMPORT_RATE_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise AuthRateLimited(retry_after)

    import_id = uuid.uuid4()
    storage_path = f"data-imports/{user.id}/{import_id}.zip"
    await data_import_repo.create_pending(
        db, import_id=import_id, user_id=user.id, storage_path=storage_path
    )
    upload_url = storage.generate_presigned_upload_url(
        storage_path, BACKUP_CONTENT_TYPE, settings.SIGNED_URL_TTL_SECONDS
    )
    await db.commit()
    return DataImportUploadResponse(
        import_id=import_id,
        upload_url=upload_url,
        storage_path=storage_path,
        expires_in=settings.SIGNED_URL_TTL_SECONDS,
        max_bytes=settings.DATA_IMPORT_MAX_BYTES,
    )


async def confirm_import(
    db: AsyncSession, user, import_id: uuid.UUID
) -> DataImportResultResponse:
    user_id = user.id  # read once: a rollback below expires every loaded ORM object
    row = await data_import_repo.get_for_user(db, import_id, user_id, for_update=True)
    if not row:
        raise DataImportNotFound()
    if row.status != "pending":
        raise DataImportInvalid(REASON_ALREADY_PROCESSED)

    file_size: int | None = None
    try:
        file_size, archive_bytes = _read_upload(row.storage_path)
        checksum, members = _verify_backup(archive_bytes)
        entries = _parse_projects(members[PROJECTS_MEMBER])
        subscription = await subscription_repo.get_by_user(db, user_id)
        # Same cap source as project_service.create_project (BR-46, SRS_v2.2.txt:1799).
        max_projects = subscription.plan.max_projects if subscription else 0
        live = await project_repo.count_for_user(db, user_id)
        if max_projects is not None and live + len(entries) > max_projects:
            raise DataImportInvalid(
                REASON_QUOTA,
                {"live": live, "limit": max_projects, "incoming": len(entries)},
            )
    except DataImportInvalid as exc:
        await data_import_repo.mark_rejected(
            db, row, reason=exc.extra["reason"], file_size_bytes=file_size
        )
        await db.commit()
        raise

    try:
        for entry in entries:
            await _create_copy(db, user_id, entry)
        await quota_service.increment_projects(db, user_id, subscription, len(entries))
        await data_import_repo.mark_completed(
            db,
            row,
            projects_imported=len(entries),
            file_size_bytes=file_size,
            checksum=checksum,
        )
        await db.commit()
    except Exception:
        # One transaction for every copy: roll all of them back, then record the rejection.
        await db.rollback()
        row = await data_import_repo.get_for_user(db, import_id, user_id, for_update=True)
        if row is not None and row.status == "pending":
            await data_import_repo.mark_rejected(
                db, row, reason=REASON_IMPORT_FAILED, file_size_bytes=file_size
            )
            await db.commit()
        raise

    return DataImportResultResponse(
        import_id=import_id,
        status="completed",
        projects_imported=len(entries),
        skipped_binary_assets=True,
        message=IMPORT_COMPLETED_MESSAGE,
    )


async def list_history(db: AsyncSession, user, *, limit: int) -> list[DataImportHistoryItem]:
    rows = await data_import_repo.list_for_user(db, user.id, limit)
    return [
        DataImportHistoryItem(
            id=row.id,
            status=row.status,
            projects_imported=row.projects_imported,
            rejected_reason=row.rejected_reason,
            file_size_bytes=row.file_size_bytes,
            created_at=row.created_at,
            completed_at=row.completed_at,
        )
        for row in rows
    ]


# --- helpers ---


def _read_upload(storage_path: str) -> tuple[int, bytes]:
    try:
        metadata = storage.get_object_metadata(storage_path)
    except storage.ObjectNotFoundError as exc:
        raise DataImportInvalid(REASON_UPLOAD_MISSING) from exc
    if metadata.size_bytes > settings.DATA_IMPORT_MAX_BYTES:
        raise DataImportInvalid(REASON_TOO_LARGE)
    try:
        download = storage.open_object_download(storage_path)
    except storage.ObjectNotFoundError as exc:
        raise DataImportInvalid(REASON_UPLOAD_MISSING) from exc
    if download.size_bytes > settings.DATA_IMPORT_MAX_BYTES:
        download.body.close()
        raise DataImportInvalid(REASON_TOO_LARGE)
    return metadata.size_bytes, b"".join(storage.iter_object_chunks(download))


def _verify_backup(archive_bytes: bytes) -> tuple[str, dict[str, bytes]]:
    """Return ``(checksum, members)`` or raise ``DataImportInvalid``."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise DataImportInvalid(REASON_NOT_A_BACKUP) from exc

    with archive:
        names = set(archive.namelist())
        if MANIFEST_MEMBER not in names:
            raise DataImportInvalid(REASON_NOT_A_BACKUP)
        # Guard against decompression bombs before inflating anything.
        if sum(info.file_size for info in archive.infolist()) > settings.DATA_IMPORT_MAX_BYTES:
            raise DataImportInvalid(REASON_TOO_LARGE)
        manifest = _load_json(_read_member(archive, MANIFEST_MEMBER, REASON_NOT_A_BACKUP))
        if (
            not isinstance(manifest, dict)
            or manifest.get("format") != BACKUP_FORMAT
            or manifest.get("format_version") != settings.DATA_BACKUP_FORMAT_VERSION
        ):
            raise DataImportInvalid(REASON_NOT_A_BACKUP)
        declared = manifest.get("files")
        if (
            not isinstance(declared, dict)
            or set(declared) != set(BACKUP_MEMBERS)
            or not names.issuperset(BACKUP_MEMBERS)
        ):
            raise DataImportInvalid(REASON_NOT_A_BACKUP)
        members = {
            name: _read_member(archive, name, REASON_CHECKSUM) for name in BACKUP_MEMBERS
        }

    actual = {name: file_digest(data) for name, data in members.items()}
    checksum = aggregate_checksum(actual)
    if any(
        not isinstance(declared[name], str) or not hmac.compare_digest(declared[name], actual[name])
        for name in BACKUP_MEMBERS
    ):
        raise DataImportInvalid(REASON_CHECKSUM)
    declared_checksum = manifest.get("checksum")
    if not isinstance(declared_checksum, str) or not hmac.compare_digest(
        declared_checksum, checksum
    ):
        raise DataImportInvalid(REASON_CHECKSUM)
    signature = manifest.get("signature")
    if not isinstance(signature, str) or not hmac.compare_digest(
        signature, sign_checksum(checksum)
    ):
        raise DataImportInvalid(REASON_SIGNATURE)
    return checksum, members


def _read_member(archive: zipfile.ZipFile, name: str, reason: str) -> bytes:
    try:
        return archive.read(name)
    except (zipfile.BadZipFile, zlib.error, EOFError) as exc:
        # A member whose stored CRC or deflate stream is corrupt fails integrity checks.
        raise DataImportInvalid(reason) from exc


def _load_json(data: bytes) -> Any:
    try:
        return json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataImportInvalid(REASON_NOT_A_BACKUP) from exc


def _parse_projects(data: bytes) -> list[dict[str, Any]]:
    entries = _load_json(data)
    if not isinstance(entries, list):
        raise DataImportInvalid(REASON_NOT_A_BACKUP)
    for entry in entries:
        if (
            not isinstance(entry, dict)
            or not isinstance(entry.get("name"), str)
            or not entry["name"].strip()
            or not isinstance(entry.get("description"), (str, type(None)))
            or not isinstance(entry.get("design_config"), (dict, type(None)))
        ):
            raise DataImportInvalid(REASON_NOT_A_BACKUP)
    return entries


def _copy_name(original: str) -> str:
    base = original.strip()[: _PROJECT_NAME_MAX - len(IMPORTED_NAME_SUFFIX)]
    return f"{base}{IMPORTED_NAME_SUFFIX}"


async def _create_copy(db: AsyncSession, user_id: uuid.UUID, entry: dict[str, Any]) -> None:
    """New row, new UUID, status draft, unlocked, no canonical model and no thumbnail: the
    original project (same id or name) is never read or written."""
    project = await project_repo.create(
        db, user_id=user_id, name=_copy_name(entry["name"]), description=entry.get("description")
    )
    if entry.get("design_config") is not None:
        await project_repo.update_fields(db, project, {"design_config": entry["design_config"]})
