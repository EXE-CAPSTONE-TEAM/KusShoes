import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design_template import DesignTemplate


async def get_by_id(db: AsyncSession, template_id: uuid.UUID) -> DesignTemplate | None:
    return await db.get(DesignTemplate, template_id)


async def list_templates(
    db: AsyncSession, *, status: str | None = None, category: str | None = None
) -> list[DesignTemplate]:
    query = select(DesignTemplate)
    if status is not None:
        query = query.where(DesignTemplate.status == status)
    if category is not None:
        query = query.where(DesignTemplate.category == category)
    result = await db.execute(query.order_by(DesignTemplate.created_at.desc()))
    return list(result.scalars())


async def create(db: AsyncSession, **fields) -> DesignTemplate:
    template = DesignTemplate(**fields)
    db.add(template)
    await db.flush()
    return template
