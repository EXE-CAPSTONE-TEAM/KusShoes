import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure import storage
from app.repositories import project_asset_repo

SUPPORTED_EXPORTS: dict[str, tuple[str, str]] = {
    "glb": ("final_shoe.glb", "model/gltf-binary"),
    "obj": ("final_shoe.obj.zip", "application/zip"),
}
MAX_SOURCE_BYTES = 500 * 1024 * 1024
MAX_DECAL_BYTES = 5 * 1024 * 1024
MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024
ALLOWED_DECAL_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


def normalise_formats(value: Any) -> list[str]:
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


def staging_key(project_id: uuid.UUID, job_id: uuid.UUID, claim_id: uuid.UUID, filename: str) -> str:
    """Per-claim upload key (ADR-009): a re-claim never shares keys with an expired claimant."""
    return f"staging/{project_id}/{job_id}/{claim_id}/{filename}"


def final_export_key(project_id: uuid.UUID, job_id: uuid.UUID, filename: str) -> str:
    """Where a verified export lives; no presigned capability ever covers it."""
    return f"exports/{project_id}/{job_id}/{filename}"


def final_prepare_key(
    project_id: uuid.UUID, job_id: uuid.UUID, filename: str = "prepared.glb"
) -> str:
    """Where a verified prepared model lives; no presigned capability ever covers it (spec §A.6)."""
    return f"models/{project_id}/{job_id}/{filename}"


async def build_bake_payload(
    db: AsyncSession,
    *,
    project,
    job,
    formats: list[str],
    claim_id: uuid.UUID,
    watermark: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Capability payload for the desktop sidecar's ``/bake`` plus the staging outputs issued.

    Every URL expires with the claim lease (CLAIM_LEASE_SECONDS)."""
    # The model the job was created against; complete() rejects the job if the canonical
    # model changed since (spec §A.5.4).
    source_id = getattr(job, "source_asset_id", None) or project.canonical_model_asset_id
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

    ttl = settings.CLAIM_LEASE_SECONDS
    asset_downloads: list[dict[str, Any]] = []
    for asset_id in extract_referenced_asset_ids(job.design_config_snapshot):
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

    issued_outputs: list[dict[str, Any]] = []
    output_capabilities: list[dict[str, Any]] = []
    for export_format in formats:
        filename, content_type = SUPPORTED_EXPORTS[export_format]
        file_path = staging_key(project.id, job.id, claim_id, filename)
        output = {
            "format": export_format,
            "file_path": file_path,
            "content_type": content_type,
        }
        issued_outputs.append(output)
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
            # Only the fields the sidecar renders (spec §E.3); max_edge_px is a 2D-thumbnail knob.
            "watermark": {
                "required": bool(watermark["required"]),
                "text": str(watermark["text"]),
                "opacity_percent": int(watermark["opacity_percent"]),
            },
        },
        issued_outputs,
    )


async def build_prepare_payload(
    db: AsyncSession,
    *,
    project,
    job,
    claim_id: uuid.UUID,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Capability payload for the desktop sidecar's ``/prepare`` plus the staging output issued.

    Every URL expires with the claim lease (CLAIM_LEASE_SECONDS).
    """
    source_id = getattr(job, "source_asset_id", None)
    if not source_id:
        raise ValueError("Job chưa có raw model asset")
    source = await project_asset_repo.get_by_id(db, source_id)
    if (
        not source
        or source.project_id != project.id
        or source.user_id != project.user_id
        or source.asset_type != "source_model"
        or source.status != "raw"
        or source.mime_type != "model/gltf-binary"
        or type(source.file_size_bytes) is not int
        or not 0 < source.file_size_bytes <= MAX_SOURCE_BYTES
        or not source.file_path
    ):
        raise ValueError("Raw model GLB không hợp lệ hoặc chưa sẵn sàng")

    ttl = settings.CLAIM_LEASE_SECONDS
    filename = "prepared.glb"
    content_type = "model/gltf-binary"
    staging_path = staging_key(project.id, job.id, claim_id, filename)
    issued_outputs = [
        {
            "format": "glb",
            "file_path": staging_path,
            "content_type": content_type,
        }
    ]
    output_capabilities = [
        {
            "format": "glb",
            "file_path": staging_path,
            "upload_url": storage.generate_presigned_upload_url(
                staging_path,
                content_type,
                ttl,
            ),
            "content_type": content_type,
        }
    ]

    return (
        {
            "job_id": str(job.id),
            "project_id": str(project.id),
            "crop_box": job.crop_box or {},
            "source_model": {
                "asset_id": str(source.id),
                "download_url": storage.generate_presigned_download_url(source.file_path, ttl),
                "file_size_bytes": source.file_size_bytes,
                "mime_type": source.mime_type,
            },
            "outputs": output_capabilities,
        },
        issued_outputs,
    )


def extract_referenced_asset_ids(design_config: Any) -> list[uuid.UUID]:
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
