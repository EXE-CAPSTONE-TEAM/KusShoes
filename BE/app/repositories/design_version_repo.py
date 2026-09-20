import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design_version import DesignVersion
from app.types import JsonObject


async def get_latest(db: AsyncSession, project_id: uuid.UUID) -> DesignVersion | None:
    result = await db.execute(
        select(DesignVersion)
        .where(DesignVersion.project_id == project_id)
        .order_by(DesignVersion.version_no.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get(
    db: AsyncSession, project_id: uuid.UUID, version_id: uuid.UUID
) -> DesignVersion | None:
    result = await db.execute(
        select(DesignVersion).where(
            DesignVersion.id == version_id, DesignVersion.project_id == project_id
        )
    )
    return result.scalar_one_or_none()


async def list_for_project(db: AsyncSession, project_id: uuid.UUID) -> list[DesignVersion]:
    result = await db.execute(
        select(DesignVersion)
        .where(DesignVersion.project_id == project_id)
        .order_by(DesignVersion.version_no.desc())
    )
    return list(result.scalars())


async def create(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    design_config: JsonObject,
    thumbnail_path: str | None,
    is_pinned: bool = False,
    export_bake_job_id: uuid.UUID | None = None,
) -> DesignVersion:
    next_no = (
        await db.execute(
            select(func.coalesce(func.max(DesignVersion.version_no), 0)).where(
                DesignVersion.project_id == project_id
            )
        )
    ).scalar_one() + 1
    version = DesignVersion(
        project_id=project_id,
        version_no=next_no,
        design_config=design_config,
        thumbnail_path=thumbnail_path,
        is_pinned=is_pinned,
        export_bake_job_id=export_bake_job_id,
    )
    db.add(version)
    await db.flush()
    return version


async def prune(db: AsyncSession, project_id: uuid.UUID, keep: int) -> None:
    """Delete the oldest unpinned versions beyond `keep`."""
    ids = (
        await db.execute(
            select(DesignVersion.id)
            .where(DesignVersion.project_id == project_id, DesignVersion.is_pinned.is_(False))
            .order_by(DesignVersion.version_no.desc())
            .offset(keep)
        )
    ).scalars().all()
    if ids:
        await db.execute(delete(DesignVersion).where(DesignVersion.id.in_(ids)))
