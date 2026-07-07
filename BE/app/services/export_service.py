import base64
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ExportCursorInvalid, ExportNotFound
from app.infrastructure import storage
from app.repositories import export_record_repo
from app.schemas.export import (
    ExportDownloadResponse,
    ExportHistoryItem,
    ExportHistoryResponse,
)


async def list_history(
    db: AsyncSession,
    user,
    *,
    project_id: uuid.UUID | None,
    format: str | None,
    limit: int,
    cursor: str | None,
) -> ExportHistoryResponse:
    decoded = _decode_cursor(cursor) if cursor else None
    rows = await export_record_repo.list_for_user(
        db,
        user.id,
        project_id=project_id,
        format=format,
        limit=limit,
        cursor=decoded,
    )
    has_next = len(rows) > limit
    page = rows[:limit]
    next_cursor = _encode_cursor(page[-1][0]) if has_next and page else None
    return ExportHistoryResponse(
        items=[
            ExportHistoryItem(
                id=record.id,
                project_id=record.project_id,
                project_name=project_name,
                format=record.format,
                file_size_bytes=record.file_size_bytes,
                download_count=record.download_count,
                created_at=record.created_at,
            )
            for record, project_name in page
        ],
        next_cursor=next_cursor,
        has_next=has_next,
    )


async def create_download_url(
    db: AsyncSession, user, export_id: uuid.UUID
) -> ExportDownloadResponse:
    record = await export_record_repo.get_for_user(db, export_id, user.id)
    if not record:
        raise ExportNotFound()
    download_url = storage.generate_presigned_download_url(record.file_path, ttl=3600)
    await export_record_repo.increment_download_count(db, record)
    return ExportDownloadResponse(download_url=download_url)


def _encode_cursor(record) -> str:
    payload = json.dumps({"created_at": record.created_at.isoformat(), "id": str(record.id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        value = datetime.fromisoformat(payload["created_at"])
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value, uuid.UUID(payload["id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ExportCursorInvalid()
