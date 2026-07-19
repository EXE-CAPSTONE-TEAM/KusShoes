import uuid
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure import editor_worker, storage
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    monthly_usage_repo,
    project_asset_repo,
    project_repo,
    subscription_repo,
)

SUPPORTED_EXPORTS: dict[str, tuple[str, str]] = {
    "glb": ("final_shoe.glb", "model/gltf-binary"),
    "obj": ("final_shoe.obj.zip", "application/zip"),
}
MAX_SOURCE_BYTES = 500 * 1024 * 1024
MAX_DECAL_BYTES = 5 * 1024 * 1024
MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024
ALLOWED_DECAL_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


async def process_bake(
    db: AsyncSession,
    job_id: uuid.UUID,
    worker_id: str | None,
) -> dict:
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job:
        return {"status": "ignored", "reason": "job_not_found"}
    # Only a queued job may be claimed. This protects cancelled jobs and
    # makes duplicate Celery delivery harmless.
    if job.status != "queued":
        return {"status": "ignored", "reason": f"status_{job.status}"}

    project = await project_repo.get_by_id(db, job.project_id)
    if not project:
        bake_job_repo.mark_failed(job, "Project không tồn tại")
        await db.commit()
        return {"status": "failed", "reason": "project_not_found"}

    bake_job_repo.mark_processing(job, worker_id)
    await db.commit()

    try:
        subscription = await subscription_repo.get_by_user(db, project.user_id)
        plan_formats = subscription.plan.allowed_export_formats if subscription else ["glb"]
        formats = _normalise_formats(plan_formats)
        payload, expected_outputs = await _build_worker_payload(
            db,
            project=project,
            job=job,
            formats=formats,
        )
        response = await editor_worker.request_bake(payload)
        exports = _validate_exports(response.get("exports"), expected_outputs)
    except (httpx.HTTPError, TimeoutError):
        # Celery owns retry policy. Keeping the job processing here allows the
        # task to atomically requeue it before redelivery.
        await db.rollback()
        raise
    except (ValueError, TypeError) as exc:
        await mark_failed(db, job_id, str(exc))
        return {"status": "failed", "reason": str(exc)}

    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.status != "processing":
        await db.rollback()
        status = job.status if job else "missing"
        return {"status": "ignored", "reason": f"status_{status}"}
    project = await project_repo.get_by_id(db, job.project_id)
    if not project:
        await mark_failed(db, job_id, "Project không tồn tại sau khi bake")
        return {"status": "failed", "reason": "project_not_found"}

    await export_record_repo.create_many(
        db,
        project_id=project.id,
        bake_job_id=job.id,
        user_id=project.user_id,
        exports=exports,
    )
    await monthly_usage_repo.increment_exports(db, project.user_id, len(exports))
    bake_job_repo.mark_completed(job)
    await project_repo.set_status(db, project, "completed")
    await db.commit()
    return {"status": "completed", "exports_created": len(exports)}


async def mark_retryable(db: AsyncSession, job_id: uuid.UUID) -> None:
    """Return a transiently failed claim to the queue for Celery redelivery."""
    await db.rollback()
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.status != "processing":
        return
    await bake_job_repo.mark_requeued(db, job)
    await db.commit()


async def mark_failed(db: AsyncSession, job_id: uuid.UUID, message: str) -> None:
    await db.rollback()
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job or job.status in {"completed", "cancelled"}:
        return
    bake_job_repo.mark_failed(job, message)
    project = await project_repo.get_by_id(db, job.project_id)
    if project:
        await project_repo.set_status(db, project, "in_progress")
    await db.commit()


def _normalise_formats(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple)):
        raise ValueError("Gói dịch vụ không có danh sách định dạng export hợp lệ")
    formats: list[str] = []
    for item in value:
        export_format = str(item).lower().strip()
        if export_format in SUPPORTED_EXPORTS and export_format not in formats:
            formats.append(export_format)
    if not formats:
        raise ValueError("Gói dịch vụ không hỗ trợ định dạng bake hiện có")
    return formats


async def _build_worker_payload(
    db: AsyncSession,
    *,
    project,
    job,
    formats: list[str],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    source_id = project.canonical_model_asset_id
    if not source_id:
        raise ValueError("Project chưa có model GLB canonical")
    source = await project_asset_repo.get_by_id(db, source_id)
    if (
        not source
        or source.project_id != project.id
        or source.user_id != project.user_id
        or source.asset_type != "source_model"
        or source.status != "ready"
        or source.mime_type != "model/gltf-binary"
        or type(source.file_size_bytes) is not int
        or not 0 < source.file_size_bytes <= MAX_SOURCE_BYTES
        or not source.file_path
    ):
        raise ValueError("Model GLB canonical không hợp lệ hoặc chưa sẵn sàng")

    ttl = min(max(settings.EDITOR_WORKER_TIMEOUT_SECONDS + 300, 900), 3600)
    asset_downloads: list[dict[str, Any]] = []
    for asset_id in _extract_referenced_asset_ids(job.design_config_snapshot):
        asset = await project_asset_repo.get_by_id(db, asset_id)
        if (
            not asset
            or asset.project_id != project.id
            or asset.user_id != project.user_id
            or asset.asset_type != "sticker"
            or asset.status != "ready"
            or asset.mime_type not in ALLOWED_DECAL_MIME_TYPES
            or type(asset.file_size_bytes) is not int
            or not 0 < asset.file_size_bytes <= MAX_DECAL_BYTES
            or not asset.file_path
        ):
            raise ValueError(f"Sticker asset {asset_id} không hợp lệ hoặc chưa sẵn sàng")
        asset_downloads.append(
            {
                "asset_id": str(asset.id),
                "download_url": storage.generate_presigned_download_url(asset.file_path, ttl),
                "file_size_bytes": asset.file_size_bytes,
                "mime_type": asset.mime_type,
            }
        )

    expected_outputs: dict[str, dict[str, Any]] = {}
    output_capabilities: list[dict[str, Any]] = []
    for export_format in formats:
        filename, content_type = SUPPORTED_EXPORTS[export_format]
        file_path = f"exports/{project.id}/{job.id}/{filename}"
        output = {
            "format": export_format,
            "file_path": file_path,
            "content_type": content_type,
        }
        expected_outputs[export_format] = output
        output_capabilities.append(
            {
                **output,
                "upload_url": storage.generate_presigned_upload_url(
                    file_path,
                    content_type,
                    ttl,
                ),
            }
        )

    return (
        {
            "job_id": str(job.id),
            "project_id": str(project.id),
            "design_config": job.design_config_snapshot,
            "formats": formats,
            "source_model": {
                "asset_id": str(source.id),
                "download_url": storage.generate_presigned_download_url(source.file_path, ttl),
                "file_size_bytes": source.file_size_bytes,
                "mime_type": source.mime_type,
            },
            "asset_downloads": asset_downloads,
            "outputs": output_capabilities,
        },
        expected_outputs,
    )


def _extract_referenced_asset_ids(design_config: Any) -> list[uuid.UUID]:
    if not isinstance(design_config, dict):
        raise ValueError("Design config snapshot không hợp lệ")
    stickers = design_config.get("stickers", [])
    texts = design_config.get("texts", [])
    if (
        not isinstance(stickers, list)
        or not isinstance(texts, list)
        or len(stickers) + len(texts) > 50
    ):
        raise ValueError("Danh sách decal trong design config không hợp lệ")

    result: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    layer_groups = (
        (stickers, "assetId", "asset_id", "Sticker"),
        (texts, "renderAssetId", "render_asset_id", "Text render"),
    )
    for layers, camel_key, snake_key, label in layer_groups:
        for layer in layers:
            if not isinstance(layer, dict):
                raise ValueError("Decal layer trong design config không hợp lệ")
            raw_id = layer.get(camel_key) or layer.get(snake_key)
            if raw_id in (None, ""):
                continue
            try:
                asset_id = uuid.UUID(str(raw_id))
            except (ValueError, TypeError, AttributeError) as exc:
                raise ValueError(f"{label} asset ID không hợp lệ") from exc
            if asset_id not in seen:
                seen.add(asset_id)
                result.append(asset_id)
    return result


def _validate_exports(
    value: Any,
    expected_outputs: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) != len(expected_outputs):
        raise ValueError("Editor Worker không trả về đủ exports đã yêu cầu")

    exports: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Export item không hợp lệ")
        export_format = item.get("format")
        expected = expected_outputs.get(export_format)
        file_size = item.get("file_size_bytes")
        if (
            not expected
            or export_format in seen
            or item.get("file_path") != expected["file_path"]
            or type(file_size) is not int
            or not 0 < file_size <= MAX_EXPORT_BYTES
        ):
            raise ValueError("Worker trả về export ngoài capability được cấp")
        seen.add(export_format)
        exports.append(
            {
                "format": export_format,
                "file_path": expected["file_path"],
                "file_size_bytes": file_size,
            }
        )
    return exports
