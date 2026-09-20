import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guardrail_rule import GuardrailRule


async def list_active(db: AsyncSession) -> list[GuardrailRule]:
    result = await db.execute(select(GuardrailRule).where(GuardrailRule.is_active.is_(True)))
    return list(result.scalars())


async def list_all(db: AsyncSession) -> list[GuardrailRule]:
    result = await db.execute(
        select(GuardrailRule).order_by(GuardrailRule.kind, GuardrailRule.term)
    )
    return list(result.scalars())


async def get_by_id(db: AsyncSession, rule_id: uuid.UUID) -> GuardrailRule | None:
    return await db.get(GuardrailRule, rule_id)


async def get_by_term(db: AsyncSession, term: str) -> GuardrailRule | None:
    result = await db.execute(select(GuardrailRule).where(GuardrailRule.term == term))
    return result.scalar_one_or_none()


async def create(db: AsyncSession, *, kind: str, term: str) -> GuardrailRule:
    rule = GuardrailRule(kind=kind, term=term)
    db.add(rule)
    await db.flush()
    return rule


async def delete(db: AsyncSession, rule: GuardrailRule) -> None:
    await db.delete(rule)
    await db.flush()
