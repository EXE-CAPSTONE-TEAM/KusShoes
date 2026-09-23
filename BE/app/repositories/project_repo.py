import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import DesignRevisionConflict
from app.models.design_revision import DesignRevision
from app.models.project import Project
from app.models.user import User
from app.types import JsonObject


async def get_by_id(
    db: AsyncSession, project_id: uuid.UUID, *, for_update: bool = False
) -> Project | None:
    query = select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_owned_by_id(
    db: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Project | None:
    query = select(Project).where(
        Project.id == project_id,
        Project.user_id == user_id,
        Project.deleted_at.is_(None),
    )
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int,
    cursor: tuple[datetime, uuid.UUID] | None,
) -> list[Project]:
    query = select(Project).where(
        Project.user_id == user_id,
        Project.deleted_at.is_(None),
    )
    if cursor:
        cursor_time, cursor_id = cursor
        query = query.where(
            or_(
                Project.updated_at < cursor_time,
                and_(Project.updated_at == cursor_time, Project.id < cursor_id),
            )
        )
    result = await db.execute(
        query.order_by(Project.updated_at.desc(), Project.id.desc()).limit(limit + 1)
    )
    return list(result.scalars())


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
    description: str | None,
) -> Project:
    project = Project(user_id=user_id, name=name, description=description, status="draft")
    db.add(project)
    await db.flush()
    return project


async def count_for_user(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(Project.id)).where(
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


async def update_fields(db: AsyncSession, project: Project, changes: dict) -> Project:
    for field, value in changes.items():
        setattr(project, field, value)
    await db.flush()
    return project


async def soft_delete(db: AsyncSession, project: Project) -> None:
    project.deleted_at = datetime.now(UTC)
    await db.flush()


async def get_deleted_by_id(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_not(None))
    )
    return result.scalar_one_or_none()


async def list_deleted_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int,
    cursor: tuple[datetime, uuid.UUID] | None,
) -> list[Project]:
    query = select(Project).where(
        Project.user_id == user_id,
        Project.deleted_at.is_not(None),
    )
    if cursor:
        cursor_time, cursor_id = cursor
        query = query.where(
            or_(
                Project.deleted_at < cursor_time,
                and_(Project.deleted_at == cursor_time, Project.id < cursor_id),
            )
        )
    result = await db.execute(
        query.order_by(Project.deleted_at.desc(), Project.id.desc()).limit(limit + 1)
    )
    return list(result.scalars())


async def restore(db: AsyncSession, project: Project) -> None:
    project.deleted_at = None
    await db.flush()


async def clear_canonical_asset(db: AsyncSession, project: Project) -> None:
    project.canonical_model_asset_id = None
    await db.flush()


async def hard_delete(db: AsyncSession, project: Project) -> None:
    await db.delete(project)
    await db.flush()


async def save_design(
    db: AsyncSession,
    project: Project,
    *,
    design_config: JsonObject,
    thumbnail_path: str | None,
    base_revision: int,
    author_user_id: uuid.UUID,
    client: str | None,
) -> None:
    """Caller must already hold the row lock (fetch with for_update=True)."""
    if project.current_design_revision != base_revision:
        raise DesignRevisionConflict(project)

    next_revision = project.current_design_revision + 1
    db.add(
        DesignRevision(
            project_id=project.id,
            revision=next_revision,
            design_config=design_config,
            author_user_id=author_user_id,
            client=client,
        )
    )
    project.design_config = design_config
    project.thumbnail_path = thumbnail_path
    project.status = "in_progress"
    project.current_design_revision = next_revision
    await db.flush()


async def set_status(db: AsyncSession, project: Project, status: str) -> None:
    project.status = status
    await db.flush()


async def reset_status_for_projects(
    db: AsyncSession, project_ids: Iterable[uuid.UUID], status: str = "in_progress"
) -> None:
    """Release projects left in `baking` by a swept job; any other status is newer state
    written after the claim (e.g. a completed re-bake) and must not be overwritten."""
    ids = list(project_ids)
    if not ids:
        return
    await db.execute(
        update(Project)
        .where(Project.id.in_(ids), Project.status == "baking")
        .values(status=status)
    )
    await db.flush()


async def lock_excess_for_user(db: AsyncSession, user_id: uuid.UUID, keep_count: int) -> int:
    """BR-27: on downgrade, keep the `keep_count` most-recently-edited
    projects editable and lock the rest read-only. Returns count locked."""
    result = await db.execute(
        select(Project.id)
        .where(Project.user_id == user_id, Project.deleted_at.is_(None))
        .order_by(Project.updated_at.desc(), Project.id.desc())
        .offset(max(keep_count, 0))
    )
    excess_ids = [row for row in result.scalars()]
    if not excess_ids:
        return 0
    # Keep updated_at as is: locking is not an edit, and the column's onupdate would
    # otherwise make locked projects look like the most recently edited ones.
    await db.execute(
        update(Project)
        .where(Project.id.in_(excess_ids))
        .values(is_locked=True, updated_at=Project.updated_at)
    )
    await db.flush()
    return len(excess_ids)


async def unlock_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Project)
        .where(Project.user_id == user_id, Project.is_locked.is_(True))
        .values(is_locked=False, updated_at=Project.updated_at)
    )
    await db.flush()


async def set_canonical_asset(
    db: AsyncSession,
    project: Project,
    asset_id: uuid.UUID | None,
) -> None:
    project.canonical_model_asset_id = asset_id
    await db.flush()


async def get_by_id_any(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    """Includes soft-deleted rows."""
    return await db.get(Project, project_id)


async def list_admin(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    include_deleted: bool = False,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[tuple[Project, str | None]]:
    query = select(Project, User.email).outerjoin(User, User.id == Project.user_id)
    if user_id is not None:
        query = query.where(Project.user_id == user_id)
    if status is not None:
        query = query.where(Project.status == status)
    if q:
        query = query.where(Project.name.ilike(f"%{q}%"))
    if not include_deleted:
        query = query.where(Project.deleted_at.is_(None))
    if before is not None:
        if before_id is not None:
            query = query.where(
                or_(
                    Project.created_at < before,
                    and_(
                        Project.created_at == before,
                        Project.id < before_id,
                    ),
                )
            )
        else:
            query = query.where(Project.created_at < before)
    query = query.order_by(Project.created_at.desc(), Project.id.desc()).limit(limit)
    result = await db.execute(query)
    return [(project, owner_email) for project, owner_email in result.all()]



async def list_expired_trash(db: AsyncSession, *, deleted_before: datetime) -> list[Project]:
    result = await db.execute(
        select(Project).where(
            Project.deleted_at.is_not(None), Project.deleted_at <= deleted_before
        )
    )
    return list(result.scalars())
