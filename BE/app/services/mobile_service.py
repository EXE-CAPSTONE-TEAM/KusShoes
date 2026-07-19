import hashlib
import json
import secrets
import uuid
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    MobileComputeUnavailable,
    MobileScanCompletionInvalid,
    MobileScanGrantInvalid,
    MobileScanPublishConflict,
)
from app.infrastructure import storage
from app.repositories import project_asset_repo, project_repo, user_repo
from app.schemas.mobile import (
    MobileComputeGrantClaimResponse,
    MobileOutputConfirmRequest,
    MobileOutputConfirmResponse,
    MobileOutputUploadResponse,
    MobileScanBootstrapRequest,
    MobileScanBootstrapResponse,
)
from app.schemas.project import CreateProjectRequest
from app.schemas.project_asset import AssetConfirmRequest
from app.services import asset_service, project_service

GRANT_PREFIX = "mobile-compute-grant"
CLAIMED_GRANT_PREFIX = "mobile-claimed-grant"
COMPLETION_PREFIX = "mobile-scan-completion"
BOOTSTRAP_PREFIX = "mobile-scan-bootstrap"
LOCK_PREFIX = "mobile-scan-lock"

ATOMIC_CLAIM_SCRIPT = """
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then
    return 0
end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[5])
return 1
"""


def _token_key(prefix: str, raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def _web_project_url(project_id: uuid.UUID) -> str:
    return f"{settings.PUBLIC_WEB_URL.rstrip('/')}/projects/{project_id}"


def _decode_record(raw: bytes | str | None, error: Exception) -> dict[str, Any]:
    if raw is None:
        raise error
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError) as exc:
        raise error from exc
    if not isinstance(value, dict):
        raise error
    return value


async def bootstrap_scan(
    db: AsyncSession,
    redis: aioredis.Redis,
    user,
    body: MobileScanBootstrapRequest,
) -> MobileScanBootstrapResponse:
    if not settings.MOBILE_COMPUTE_URL or not settings.MOBILE_COMPUTE_SERVICE_TOKEN:
        raise MobileComputeUnavailable()

    idempotency_key = f"{BOOTSTRAP_PREFIX}:{user.id}:{body.client_request_id}"
    cached = await redis.get(idempotency_key)
    if cached:
        return MobileScanBootstrapResponse.model_validate_json(cached)

    lock_key = f"{LOCK_PREFIX}:bootstrap:{user.id}:{body.client_request_id}"
    if not await redis.set(lock_key, "1", ex=15, nx=True):
        cached = await redis.get(idempotency_key)
        if cached:
            return MobileScanBootstrapResponse.model_validate_json(cached)
        raise MobileScanPublishConflict()

    try:
        cached = await redis.get(idempotency_key)
        if cached:
            return MobileScanBootstrapResponse.model_validate_json(cached)

        project_response = await project_service.create_project(
            db,
            user,
            CreateProjectRequest(
                name=body.project_name,
                description="Project được tạo từ mobile 3D scan",
            ),
        )
        await db.commit()

        grant = secrets.token_urlsafe(32)
        web_project_url = _web_project_url(project_response.id)
        response = MobileScanBootstrapResponse(
            project_id=project_response.id,
            compute_api_url=settings.MOBILE_COMPUTE_URL.rstrip("/"),
            compute_grant=grant,
            expires_in=max(30, settings.MOBILE_GRANT_TTL_SECONDS),
            web_project_url=web_project_url,
        )
        grant_record = {
            "user_id": str(user.id),
            "project_id": str(project_response.id),
            "project_name": body.project_name,
            "web_project_url": web_project_url,
        }
        async with redis.pipeline(transaction=True) as pipe:
            pipe.set(
                _token_key(GRANT_PREFIX, grant),
                json.dumps(grant_record, separators=(",", ":")),
                ex=response.expires_in,
            )
            pipe.set(
                idempotency_key,
                response.model_dump_json(),
                ex=max(response.expires_in, 600),
            )
            await pipe.execute()
        return response
    finally:
        await redis.delete(lock_key)


async def claim_compute_grant(
    db: AsyncSession,
    redis: aioredis.Redis,
    raw_grant: str,
) -> MobileComputeGrantClaimResponse:
    grant_key = _token_key(GRANT_PREFIX, raw_grant)
    claimed_key = _token_key(CLAIMED_GRANT_PREFIX, raw_grant)

    already_claimed = await redis.get(claimed_key)
    if already_claimed:
        return MobileComputeGrantClaimResponse.model_validate_json(already_claimed)

    raw_record = await redis.get(grant_key)
    record = _decode_record(raw_record, MobileScanGrantInvalid())
    user, project = await _load_context(
        db,
        record,
        error=MobileScanGrantInvalid(),
    )

    completion_token = secrets.token_urlsafe(32)
    completion_key = _token_key(COMPLETION_PREFIX, completion_token)
    completion_record = {
        **record,
        "status": "active",
        "asset_id": None,
    }
    response = MobileComputeGrantClaimResponse(
        user_id=user.id,
        project_id=project.id,
        project_name=project.name,
        completion_token=completion_token,
        web_project_url=str(record["web_project_url"]),
    )
    completion_ttl = max(3600, settings.MOBILE_COMPLETION_TTL_SECONDS)
    moved = await redis.eval(
        ATOMIC_CLAIM_SCRIPT,
        3,
        grant_key,
        completion_key,
        claimed_key,
        raw_record,
        json.dumps(completion_record, separators=(",", ":")),
        response.model_dump_json(),
        completion_ttl,
        max(300, settings.MOBILE_GRANT_TTL_SECONDS),
    )
    if not moved:
        already_claimed = await redis.get(claimed_key)
        if already_claimed:
            return MobileComputeGrantClaimResponse.model_validate_json(already_claimed)
        raise MobileScanGrantInvalid()
    return response


async def create_output_upload(
    db: AsyncSession,
    redis: aioredis.Redis,
    completion_token: str,
) -> MobileOutputUploadResponse:
    completion_key = _token_key(COMPLETION_PREFIX, completion_token)
    record = _decode_record(
        await redis.get(completion_key),
        MobileScanCompletionInvalid(),
    )
    user, project = await _load_context(
        db,
        record,
        error=MobileScanCompletionInvalid(),
    )

    asset_id = _canonical_mobile_asset_id(project.id, completion_token)
    file_path = f"source_models/{project.id}/{asset_id}.glb"
    if record.get("status") == "completed":
        return MobileOutputUploadResponse(
            project_id=project.id,
            asset_id=uuid.UUID(str(record["asset_id"])),
            file_path=file_path,
            upload_url=None,
            expires_in=0,
            already_completed=True,
        )

    lock_key = f"{LOCK_PREFIX}:publish:{hashlib.sha256(completion_token.encode()).hexdigest()}"
    if not await redis.set(lock_key, "1", ex=15, nx=True):
        raise MobileScanPublishConflict()

    try:
        asset = await project_asset_repo.get_by_id(db, asset_id)
        if asset:
            if (
                asset.project_id != project.id
                or asset.user_id != user.id
                or asset.asset_type != "source_model"
                or asset.file_path != file_path
                or asset.mime_type != "model/gltf-binary"
                or asset.status not in {"uploading", "ready"}
            ):
                raise MobileScanCompletionInvalid()
        else:
            asset = await project_asset_repo.create_upload(
                db,
                asset_id=asset_id,
                project_id=project.id,
                user_id=user.id,
                asset_type="source_model",
                filename="kiri-scan.glb",
                file_path=file_path,
                content_type="model/gltf-binary",
            )
            await db.commit()

        if asset.status == "ready":
            record.update(status="completed", asset_id=str(asset.id))
            await redis.set(
                completion_key,
                json.dumps(record, separators=(",", ":")),
                ex=max(3600, settings.MOBILE_COMPLETION_TTL_SECONDS),
            )
            return MobileOutputUploadResponse(
                project_id=project.id,
                asset_id=asset.id,
                file_path=file_path,
                upload_url=None,
                expires_in=0,
                already_completed=True,
            )

        record["asset_id"] = str(asset.id)
        await redis.set(
            completion_key,
            json.dumps(record, separators=(",", ":")),
            ex=max(3600, settings.MOBILE_COMPLETION_TTL_SECONDS),
        )
        upload_ttl = min(
            max(300, settings.MOBILE_OUTPUT_UPLOAD_TTL_SECONDS),
            3600,
        )
        return MobileOutputUploadResponse(
            project_id=project.id,
            asset_id=asset.id,
            file_path=file_path,
            upload_url=storage.generate_presigned_upload_url(
                file_path,
                "model/gltf-binary",
                upload_ttl,
            ),
            expires_in=upload_ttl,
            already_completed=False,
        )
    finally:
        await redis.delete(lock_key)


async def confirm_output(
    db: AsyncSession,
    redis: aioredis.Redis,
    body: MobileOutputConfirmRequest,
) -> MobileOutputConfirmResponse:
    completion_key = _token_key(COMPLETION_PREFIX, body.completion_token)
    record = _decode_record(
        await redis.get(completion_key),
        MobileScanCompletionInvalid(),
    )
    user, project = await _load_context(
        db,
        record,
        error=MobileScanCompletionInvalid(),
    )

    recorded_asset_id = record.get("asset_id")
    if not recorded_asset_id or uuid.UUID(str(recorded_asset_id)) != body.asset_id:
        raise MobileScanCompletionInvalid()

    if record.get("status") != "completed":
        await asset_service.confirm_upload(
            db,
            user,
            project.id,
            AssetConfirmRequest(
                asset_id=body.asset_id,
                file_size_bytes=body.file_size_bytes,
            ),
        )
        if body.project_name:
            await project_repo.update_fields(
                db,
                project,
                {"name": body.project_name},
            )
        await project_repo.set_status(db, project, "in_progress")
        await db.commit()

        record["status"] = "completed"
        await redis.set(
            completion_key,
            json.dumps(record, separators=(",", ":")),
            ex=max(3600, settings.MOBILE_COMPLETION_TTL_SECONDS),
        )

    return MobileOutputConfirmResponse(
        project_id=project.id,
        model_asset_id=body.asset_id,
        status="ready",
        web_project_url=str(record["web_project_url"]),
    )


async def _load_context(
    db: AsyncSession,
    record: dict[str, Any],
    *,
    error: Exception,
):
    try:
        user_id = uuid.UUID(str(record["user_id"]))
        project_id = uuid.UUID(str(record["project_id"]))
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise error from exc

    # AsyncSession cannot execute concurrent statements safely.
    user = await user_repo.get_by_id(db, user_id)
    project = await project_repo.get_owned_by_id(db, project_id, user_id)
    if not user or not project:
        raise error
    return user, project


def _canonical_mobile_asset_id(
    project_id: uuid.UUID,
    completion_token: str,
) -> uuid.UUID:
    digest = hashlib.sha256(completion_token.encode("utf-8")).hexdigest()
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"kusshoes:mobile-scan:{project_id}:{digest}",
    )
