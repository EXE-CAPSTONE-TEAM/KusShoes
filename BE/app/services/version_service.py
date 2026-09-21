"""BR-46 design version history: snapshot on save, pin on export, restore."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    DesignVersionNotFound,
    ProjectLocked,
)
from app.repositories import design_version_repo, project_repo, subscription_repo
from app.schemas.studio import DesignVersionDetail, DesignVersionItem
from app.services import guardrail_service
from app.services.project_access import require_owner
from app.types import JsonObject

DEFAULT_MAX_VERSIONS = 20


async def snapshot(
    db: AsyncSession,
    project,
    *,
    design_config: JsonObject,
    thumbnail_path: str | None,
    pin: bool = False,
    bake_job_id: uuid.UUID | None = None,
):
    """Record a version unless it is identical to the latest one. Pinning an
    identical snapshot upgrades the existing row instead of duplicating it."""
    latest = await design_version_repo.get_latest(db, project.id)
    if latest and latest.design_config == design_config:
        if pin and not latest.is_pinned:
            latest.is_pinned = True
            latest.export_bake_job_id = bake_job_id
            await db.flush()
        return latest
    version = await design_version_repo.create(
        db,
        project_id=project.id,
        design_config=design_config,
        thumbnail_path=thumbnail_path,
        is_pinned=pin,
        export_bake_job_id=bake_job_id,
    )
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    keep = subscription.plan.max_versions_per_project if subscription else DEFAULT_MAX_VERSIONS
    await design_version_repo.prune(db, project.id, keep)
    return version


async def list_versions(db: AsyncSession, user, project_id: uuid.UUID) -> list[DesignVersionItem]:
    await require_owner(db, project_id, user)
    versions = await design_version_repo.list_for_project(db, project_id)
    return [_to_item(version) for version in versions]


async def get_version(
    db: AsyncSession, user, project_id: uuid.UUID, version_id: uuid.UUID
) -> DesignVersionDetail:
    await require_owner(db, project_id, user)
    version = await design_version_repo.get(db, project_id, version_id)
    if not version:
        raise DesignVersionNotFound()
    return DesignVersionDetail(**_to_item(version).model_dump(), design_config=version.design_config)


async def restore_version(
    db: AsyncSession, user, project_id: uuid.UUID, version_id: uuid.UUID
) -> DesignVersionItem:
    """Restoring writes the old config back as a NEW latest version, so history
    is never rewritten."""
    project = await require_owner(db, project_id, user, for_update=True)
    if project.is_locked:
        raise ProjectLocked()
    version = await design_version_repo.get(db, project_id, version_id)
    if not version:
        raise DesignVersionNotFound()
    await guardrail_service.assert_not_exporting(db, project_id)
    await project_repo.save_design(
        db,
        project,
        design_config=version.design_config,
        thumbnail_path=version.thumbnail_path or project.thumbnail_path,
        base_revision=project.current_design_revision,
        author_user_id=user.id,
        client="web",
    )
    restored = await snapshot(
        db,
        project,
        design_config=version.design_config,
        thumbnail_path=version.thumbnail_path,
    )
    await db.commit()
    return _to_item(restored)


def _to_item(version) -> DesignVersionItem:
    return DesignVersionItem(
        id=version.id,
        version_no=version.version_no,
        is_pinned=version.is_pinned,
        export_bake_job_id=version.export_bake_job_id,
        thumbnail_path=version.thumbnail_path,
        created_at=version.created_at,
    )
