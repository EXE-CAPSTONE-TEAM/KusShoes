"""Ownership check shared by the project-facing services (leaf module: no service imports)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ProjectAccessDenied, ProjectNotFound
from app.repositories import project_repo


async def require_owner(db: AsyncSession, project_id: uuid.UUID, user):
    project = await project_repo.get_by_id(db, project_id)
    if not project:
        raise ProjectNotFound()
    if project.user_id != user.id:
        raise ProjectAccessDenied()
    return project
