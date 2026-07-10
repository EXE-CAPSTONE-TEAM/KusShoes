import uuid
from collections.abc import Mapping

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure import editor_worker
from app.repositories import (
    bake_job_repo,
    export_record_repo,
    monthly_usage_repo,
    project_repo,
    subscription_repo,
)


async def process_bake(
    db: AsyncSession,
    job_id: uuid.UUID,
    worker_id: str | None,
) -> dict[str, object]:
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job:
        return {"status": "ignored", "reason": "job_not_found"}
    # Guard: chỉ xử lý job đang queued — bảo vệ job đã bị admin cancel,
    # đồng thời chống duplicate delivery từ Celery
    if job.status != "queued":
        return {"status": "ignored", "reason": f"status_{job.status}"}
    project = await project_repo.get_by_id(db, job.project_id)
    if not project:
        bake_job_repo.mark_failed(job, "Project không tồn tại")
        await db.commit()
        return {"status": "failed", "reason": "project_not_found"}

    bake_job_repo.mark_processing(job, worker_id)
    await db.commit()

    subscription = await subscription_repo.get_by_user(db, project.user_id)
    formats = subscription.plan.allowed_export_formats if subscription else ["glb"]
    payload = {
        "job_id": str(job.id),
        "project_id": str(project.id),
        "design_config": job.design_config_snapshot,
        "formats": formats,
    }

    try:
        response = await editor_worker.request_bake(payload)
        exports = _validate_exports(response.get("exports"), formats)
    except httpx.HTTPError as exc:
        await _mark_failed(db, job_id, str(exc))
        raise
    except (ValueError, TypeError) as exc:
        await _mark_failed(db, job_id, str(exc))
        return {"status": "failed", "reason": str(exc)}

    job = await bake_job_repo.get_by_id(db, job_id)
    project = await project_repo.get_by_id(db, job.project_id)
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


async def _mark_failed(db: AsyncSession, job_id: uuid.UUID, message: str) -> None:
    await db.rollback()
    job = await bake_job_repo.get_by_id(db, job_id)
    if not job:
        return
    bake_job_repo.mark_failed(job, message)
    project = await project_repo.get_by_id(db, job.project_id)
    if project:
        await project_repo.set_status(db, project, "in_progress")
    await db.commit()


def _validate_exports(
    value: object,
    allowed_formats: list[str],
) -> list[export_record_repo.ExportRecordCreate]:
    if not isinstance(value, list) or not value:
        raise ValueError("Editor Worker không trả về exports hợp lệ")
    exports: list[export_record_repo.ExportRecordCreate] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ValueError("Export item không hợp lệ")
        export_format = item.get("format")
        file_path = item.get("file_path")
        file_size_bytes = item.get("file_size_bytes")
        if (
            not isinstance(export_format, str)
            or export_format not in allowed_formats
            or not isinstance(file_path, str)
            or not file_path
        ):
            raise ValueError("Export format hoặc file_path không hợp lệ")
        if file_size_bytes is not None and (
            not isinstance(file_size_bytes, int) or isinstance(file_size_bytes, bool)
        ):
            raise ValueError("Export file_size_bytes is invalid")
        exports.append(
            {
                "format": export_format,
                "file_path": file_path,
                "file_size_bytes": file_size_bytes,
            }
        )
    return exports
