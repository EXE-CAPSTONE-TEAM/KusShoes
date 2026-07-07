import uuid
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def create(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    actor_role: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
    )
    db.add(log)
    await db.flush()
    return log


async def list_all(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    q: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[AuditLog, str | None]]:
    query = select(AuditLog, User.email).outerjoin(User, User.id == AuditLog.actor_id)
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if target_type is not None:
        query = query.where(AuditLog.target_type == target_type)
    if target_id is not None:
        query = query.where(AuditLog.target_id == target_id)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(
                User.email.ilike(pattern, escape="\\"),
                AuditLog.action.ilike(pattern, escape="\\"),
                AuditLog.target_type.ilike(pattern, escape="\\"),
                AuditLog.target_id.ilike(pattern, escape="\\"),
            )
        )
    if before is not None:
        if before_id is not None:
            query = query.where((AuditLog.created_at < before) | ((AuditLog.created_at == before) & (AuditLog.id < before_id)))
        else:
            query = query.where(AuditLog.created_at < before)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(log, actor_email) for log, actor_email in result.all()]
