"""Client-executed 3D jobs: claim → run on KusStudio Desktop → complete / fail.

Spec §A (lifecycle), ADR-001 (claim protocol), ADR-009 (per-claim staging + server-side
finalize). The server never touches 3D bytes: it issues presigned capabilities, verifies what
the desktop uploaded, copies verified objects onto keys no capability covers, and records the
effects (exports, quota, canonical model).
"""
import asyncio
import hashlib
import secrets
import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    AppException,
    BakeJobNotCancellable,
    BakeJobNotFound,
    EditorModelChanged,
    JobAlreadyClaimed,
    JobClaimMismatch,
    JobClaimSuperseded,
    JobNotClaimable,
    JobOutputInvalid,
    ProjectBakeInProgress,
)
from app.infrastructure import storage
from app.models.bake_job import BakeJob
from app.models.project_asset import ProjectAsset
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    project_asset_repo,
    project_repo,
    subscription_repo,
)
from app.schemas.editor import EditorJobCompleteRequest
from app.services import bake_service, quota_service, version_service, watermark_service

# provenance: 256-bit secret (spec §Parameter & Data Provenance, "Claim / sidecar tokens").
CLAIM_TOKEN_BYTES = 32
# provenance: Khronos glTF 2.0 spec — binary glTF header magic 0x46546C67 ("glTF").
GLB_MAGIC = b"glTF"
# provenance: PKWARE APPNOTE — local file header signature 0x04034b50 ("PK\x03\x04").
ZIP_MAGIC = b"PK\x03\x04"
MAGIC_BY_CONTENT_TYPE = {"model/gltf-binary": GLB_MAGIC, "application/zip": ZIP_MAGIC}


@dataclass(frozen=True)
class ClaimResult:
    job: BakeJob
    claim_token: str
    payload: dict[str, Any]


def hash_claim_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_matches(job: BakeJob, token: str) -> bool:
    return bool(job.claim_token_hash) and secrets.compare_digest(
        job.claim_token_hash, hash_claim_token(token)
    )


def _output_paths(outputs: Sequence[dict[str, Any]] | None) -> list[str]:
    return [str(item["file_path"]) for item in outputs or [] if item.get("file_path")]


async def delete_staging(paths: Sequence[str]) -> None:
    """Best-effort removal of staging objects after the owning transaction committed.

    The job state is already durable here, so a storage error must not turn a successful
    request into a 500. Backstop for leftovers: an R2 lifecycle rule expiring the `staging/`
    prefix (deploy runbook, Ticket-13).
    """
    if not paths:
        return
    try:
        await asyncio.to_thread(storage.delete_files, list(paths))
    except Exception:
        logger.warning("Staging cleanup failed for {} object(s)", len(paths))


# --- Creation -----------------------------------------------------------------------------


async def supersede_active(db: AsyncSession, project_id: uuid.UUID) -> list[str]:
    """Make room for a new job (spec §A.1).

    An unclaimed job, or a claimed one whose lease expired, is cancelled; a live claim blocks.
    Returns the cancelled job's staging keys for the caller to delete after commit.
    """
    active = await bake_job_repo.get_active_for_project(db, project_id, for_update=True)
    if active is None:
        return []
    now = datetime.now(UTC)
    if active.status == "claimed" and active.claim_expires_at and active.claim_expires_at > now:
        raise ProjectBakeInProgress()
    stale = _output_paths(active.issued_outputs)
    await bake_job_repo.mark_cancelled(db, active)
    return stale


# --- Claim --------------------------------------------------------------------------------

PayloadBuilder = Callable[
    [AsyncSession, Any, BakeJob, uuid.UUID], Awaitable[tuple[dict[str, Any], list[dict[str, Any]]]]
]


async def _bake_payload(
    db: AsyncSession, project, job: BakeJob, claim_id: uuid.UUID
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    plan_formats = subscription.plan.allowed_export_formats if subscription else ["glb"]
    return await bake_service.build_bake_payload(
        db,
        project=project,
        job=job,
        formats=bake_service.normalise_formats(plan_formats),
        claim_id=claim_id,
        watermark=watermark_service.policy_for(subscription),
    )


async def _prepare_payload(
    db: AsyncSession, project, job: BakeJob, claim_id: uuid.UUID
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    return await bake_service.build_prepare_payload(
        db,
        project=project,
        job=job,
        claim_id=claim_id,
    )


PAYLOAD_BUILDERS: dict[str, PayloadBuilder] = {
    "bake": _bake_payload,
    "prepare": _prepare_payload,
}


async def claim(
    db: AsyncSession, job_id: uuid.UUID, *, project, device_label: str | None
) -> ClaimResult:
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.project_id != project.id:
        raise BakeJobNotFound()
    builder = PAYLOAD_BUILDERS.get(job.kind)
    if builder is None:
        raise JobNotClaimable()
    previous = _output_paths(job.issued_outputs)

    token = secrets.token_urlsafe(CLAIM_TOKEN_BYTES)
    claim_id = uuid.uuid4()
    claimed = await bake_job_repo.claim(
        db,
        job_id,
        claim_id=claim_id,
        claim_token_hash=hash_claim_token(token),
        lease_seconds=settings.CLAIM_LEASE_SECONDS,
        worker_id=device_label,
    )
    if claimed is None:
        await db.rollback()
        current = await bake_job_repo.get_by_id(db, job_id)
        if current is not None and current.status == "claimed":
            raise JobAlreadyClaimed()
        raise JobNotClaimable()

    try:
        payload, issued = await builder(db, project, claimed, claim_id)
    except ValueError as exc:
        await _mark_failed(db, claimed, str(exc))
        await db.commit()
        await delete_staging(previous)
        raise AppException(409, "JOB_PAYLOAD_INVALID", str(exc)) from exc

    claimed.issued_outputs = issued
    await db.commit()
    await delete_staging(previous)
    return ClaimResult(job=claimed, claim_token=token, payload=payload)


# --- Complete / fail ----------------------------------------------------------------------


async def _mark_failed(db: AsyncSession, job: BakeJob, message: str) -> None:
    bake_job_repo.mark_failed(job, message)
    project = await project_repo.get_by_id(db, job.project_id)
    if project:
        await project_repo.set_status(db, project, "in_progress")


async def _fail_and_raise(db: AsyncSession, job: BakeJob, error: AppException) -> None:
    stale = _output_paths(job.issued_outputs)
    await _mark_failed(db, job, error.message)
    await db.commit()
    await delete_staging(stale)
    raise error


async def _locked_claimed_job(db: AsyncSession, job_id: uuid.UUID, token: str) -> BakeJob | None:
    """Lock the job row; return None when this token already completed it (idempotent replay)."""
    job = await bake_job_repo.get_by_id(db, job_id, for_update=True)
    if job is None:
        raise BakeJobNotFound()
    if job.status == "completed" and _token_matches(job, token):
        return None
    if not _token_matches(job, token):
        # A live job holding someone else's token was re-claimed; anything else is foreign.
        if job.status == "claimed":
            raise JobClaimSuperseded()
        raise JobClaimMismatch()
    if job.status != "claimed":
        raise JobNotClaimable()
    return job


def _limit_for(job: BakeJob) -> int:
    return bake_service.MAX_EXPORT_BYTES if job.kind == "bake" else bake_service.MAX_SOURCE_BYTES


async def _verify_outputs(
    job: BakeJob, reported: EditorJobCompleteRequest
) -> list[dict[str, Any]]:
    """Check every issued staging object against what the desktop reports (spec §A.7)."""
    issued = {str(item["format"]): item for item in job.issued_outputs or []}
    seen: set[str] = set()
    verified: list[dict[str, Any]] = []
    for output in reported.outputs:
        expected = issued.get(output.format)
        if expected is None or output.format in seen:
            raise JobOutputInvalid(f"định dạng {output.format} không được cấp")
        if output.file_path != expected["file_path"]:
            raise JobOutputInvalid(f"đường dẫn {output.format} không khớp capability")
        seen.add(output.format)
        try:
            metadata = await asyncio.to_thread(storage.get_object_metadata, output.file_path)
        except storage.ObjectNotFoundError as exc:
            raise JobOutputInvalid(f"chưa tải lên {output.format}") from exc
        if metadata.size_bytes != output.file_size_bytes:
            raise JobOutputInvalid(f"dung lượng {output.format} không khớp")
        if not 0 < metadata.size_bytes <= _limit_for(job):
            raise JobOutputInvalid(f"dung lượng {output.format} vượt giới hạn")
        magic = MAGIC_BY_CONTENT_TYPE.get(str(expected["content_type"]))
        if magic is not None:
            prefix = await asyncio.to_thread(storage.read_object_prefix, output.file_path)
            if not prefix.startswith(magic):
                raise JobOutputInvalid(f"tệp {output.format} sai định dạng")
        verified.append({**expected, "file_size_bytes": metadata.size_bytes})
    if seen != set(issued):
        raise JobOutputInvalid("thiếu định dạng đã cấp")
    return verified


async def _complete_bake(
    db: AsyncSession, job: BakeJob, body: EditorJobCompleteRequest
) -> None:
    project = await project_repo.get_by_id(db, job.project_id, for_update=True)
    if project is None:
        raise BakeJobNotFound()
    if project.canonical_model_asset_id != job.source_asset_id:
        await _fail_and_raise(db, job, EditorModelChanged())
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    issued_count = len(job.issued_outputs or [])
    try:
        await quota_service.assert_export_quota(db, project.user_id, subscription, issued_count)
    except AppException as exc:
        await _fail_and_raise(db, job, exc)
    watermark = watermark_service.policy_for(subscription)
    if watermark["required"] and not body.watermark_applied:
        # BR-65: a Free export must carry the watermark; the job stays claimed for a retry.
        raise JobOutputInvalid("thiếu watermark bắt buộc cho gói Free")

    verified = await _verify_outputs(job, body)
    finals: list[dict[str, Any]] = []
    for item in verified:
        filename = bake_service.SUPPORTED_EXPORTS[str(item["format"])][0]
        final_path = bake_service.final_export_key(project.id, job.id, filename)
        await asyncio.to_thread(storage.copy_object, str(item["file_path"]), final_path)
        finals.append(
            {
                "format": item["format"],
                "file_path": final_path,
                "file_size_bytes": item["file_size_bytes"],
            }
        )
    await export_record_repo.create_many(
        db,
        project_id=project.id,
        bake_job_id=job.id,
        user_id=project.user_id,
        exports=finals,
        is_watermarked=bool(watermark["required"]),
    )
    await quota_service.increment_exports(db, project.user_id, subscription, len(finals))
    await project_repo.set_status(db, project, "completed")
    job.result = {"exports": finals}


async def _complete_prepare(
    db: AsyncSession, job: BakeJob, body: EditorJobCompleteRequest
) -> None:
    project = await project_repo.get_by_id(db, job.project_id, for_update=True)
    if project is None:
        raise BakeJobNotFound()
    if not job.source_asset_id:
        await _fail_and_raise(db, job, EditorModelChanged())
    raw_asset = await project_asset_repo.get_by_id(db, job.source_asset_id)
    if (
        not raw_asset
        or raw_asset.project_id != project.id
        or raw_asset.user_id != project.user_id
    ):
        await _fail_and_raise(db, job, EditorModelChanged())

    verified = await _verify_outputs(job, body)
    staging_item = verified[0]
    final_path = bake_service.final_prepare_key(project.id, job.id)
    await asyncio.to_thread(storage.copy_object, str(staging_item["file_path"]), final_path)

    new_asset = ProjectAsset(
        project_id=project.id,
        user_id=project.user_id,
        asset_type="source_model",
        original_filename=raw_asset.original_filename or "prepared.glb",
        file_path=final_path,
        file_size_bytes=staging_item["file_size_bytes"],
        mime_type="model/gltf-binary",
        status="ready",
        derived_from_asset_id=raw_asset.id,
        metadata_=body.cleanup_report or {},
    )
    db.add(new_asset)
    await db.flush()

    await project_repo.set_canonical_asset(db, project, new_asset.id)

    # Design handling [OD-1]: re-crop when a design exists resets the design
    # (new revision with empty stickers/texts, modelAssetId = new asset).
    if project.design_config:
        new_design = dict(project.design_config)
        new_design["modelAssetId"] = str(new_asset.id)
        if "model_asset_id" in new_design:
            new_design["model_asset_id"] = str(new_asset.id)
        new_design["stickers"] = []
        new_design["texts"] = []
        await project_repo.save_design(
            db,
            project,
            design_config=new_design,
            thumbnail_path=project.thumbnail_path,
            base_revision=project.current_design_revision,
            author_user_id=project.user_id,
            client="desktop",
        )
        await version_service.snapshot(
            db,
            project,
            design_config=new_design,
            thumbnail_path=project.thumbnail_path,
        )

    finals = [
        {
            "format": "glb",
            "file_path": final_path,
            "file_size_bytes": staging_item["file_size_bytes"],
        }
    ]
    job.result = {
        "outputs": finals,
        "model_asset_id": str(new_asset.id),
        "cleanup_report": body.cleanup_report,
    }


COMPLETERS: dict[
    str, Callable[[AsyncSession, BakeJob, EditorJobCompleteRequest], Awaitable[None]]
] = {
    "bake": _complete_bake,
    "prepare": _complete_prepare,
}


async def complete(
    db: AsyncSession, job_id: uuid.UUID, token: str, body: EditorJobCompleteRequest
) -> BakeJob:
    job = await _locked_claimed_job(db, job_id, token)
    if job is None:  # idempotent replay of a completed job
        await db.commit()  # nothing written; releases the row lock without expiring the session
        replay = await bake_job_repo.get_by_id(db, job_id)
        assert replay is not None
        return replay
    completer = COMPLETERS.get(job.kind)
    if completer is None:
        raise JobNotClaimable()
    staging = _output_paths(job.issued_outputs)
    await completer(db, job, body)
    bake_job_repo.mark_completed(job)
    await db.commit()
    await delete_staging(staging)
    await db.refresh(job)
    return job


async def fail(
    db: AsyncSession, job_id: uuid.UUID, token: str, *, code: str, message: str
) -> BakeJob:
    job = await bake_job_repo.get_by_id(db, job_id, for_update=True)
    if job is None:
        raise BakeJobNotFound()
    if not _token_matches(job, token):
        if job.status == "claimed":
            raise JobClaimSuperseded()
        raise JobClaimMismatch()
    if job.status == "failed":  # idempotent
        await db.commit()  # nothing written; releases the row lock
        return job
    if job.status != "claimed":
        raise JobNotClaimable()
    staging = _output_paths(job.issued_outputs)
    await _mark_failed(db, job, f"{code}: {message}")
    await db.commit()
    await delete_staging(staging)
    await db.refresh(job)
    return job


async def cancel(db: AsyncSession, job: BakeJob) -> None:
    """Cancel an active job (owner/admin paths, spec §B.4); caller commits."""
    if job.status not in bake_job_repo.ACTIVE_STATUSES:
        raise BakeJobNotCancellable()
    await bake_job_repo.mark_cancelled(db, job)
