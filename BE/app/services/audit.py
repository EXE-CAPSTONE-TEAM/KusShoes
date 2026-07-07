"""Shared audit-recording helper — mọi thao tác ghi của admin gọi hàm này
ngay trước db.commit() để audit row commit chung transaction với thay đổi chính."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import audit_log_repo


async def record_audit(
    db: AsyncSession,
    actor,
    action: str,
    *,
    target_type: str | None = None,
    target_id=None,
    payload: dict | None = None,
) -> None:
    await audit_log_repo.create(
        db,
        actor_id=actor.id,
        actor_role=actor.role,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        payload=payload,
    )
