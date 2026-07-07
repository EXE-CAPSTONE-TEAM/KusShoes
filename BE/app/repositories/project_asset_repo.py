import uuid

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_asset import ProjectAsset


async def create_upload(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    asset_type: str,
    filename: str,
    file_path: str,
    content_type: str,
) -> ProjectAsset:
    asset = ProjectAsset(
        project_id=project_id,
        user_id=user_id,
        asset_type=asset_type,
        original_filename=filename,
        file_path=file_path,
        mime_type=content_type,
        status="uploading",
    )
    db.add(asset)
    await db.flush()
    return asset


async def get_by_id(db: AsyncSession, asset_id: uuid.UUID) -> ProjectAsset | None:
    result = await db.execute(select(ProjectAsset).where(ProjectAsset.id == asset_id))
    return result.scalar_one_or_none()


async def list_for_project(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectAsset]:
    result = await db.execute(
        select(ProjectAsset)
        .where(ProjectAsset.project_id == project_id)
        .order_by(ProjectAsset.created_at.desc(), ProjectAsset.id.desc())
    )
    return list(result.scalars())


async def mark_ready(
    db: AsyncSession,
    asset: ProjectAsset,
    *,
    file_size_bytes: int,
) -> None:
    asset.status = "ready"
    asset.file_size_bytes = file_size_bytes
    await db.flush()


async def delete(db: AsyncSession, asset: ProjectAsset) -> None:
    await db.delete(asset)
    await db.flush()


async def delete_for_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    await db.execute(sql_delete(ProjectAsset).where(ProjectAsset.project_id == project_id))
