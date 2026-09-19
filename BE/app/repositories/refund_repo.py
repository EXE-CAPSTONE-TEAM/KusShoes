import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refund import Refund


async def create(
    db: AsyncSession,
    *,
    invoice_id: uuid.UUID,
    amount_vnd: int,
    reason: str,
    created_by: uuid.UUID,
) -> Refund:
    refund = Refund(
        invoice_id=invoice_id, amount_vnd=amount_vnd, reason=reason, created_by=created_by
    )
    db.add(refund)
    await db.flush()
    return refund
