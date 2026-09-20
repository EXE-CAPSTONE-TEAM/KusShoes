import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.studio import (
    ArtisanLinkCreate,
    ArtisanLinkCreated,
    ArtisanLinkResponse,
    DesignVersionDetail,
    DesignVersionItem,
    TemplateListItem,
)
from app.schemas.user import MessageResponse
from app.services import artisan_service, reference_pack_service, template_service, version_service
from app.utils.http import attachment_response

router = APIRouter()


# --- Design version history (BR-46) ---
@router.get("/projects/{project_id}/versions", response_model=list[DesignVersionItem])
async def list_versions(
    project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await version_service.list_versions(db, user, project_id)


@router.get("/projects/{project_id}/versions/{version_id}", response_model=DesignVersionDetail)
async def get_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await version_service.get_version(db, user, project_id, version_id)


@router.post(
    "/projects/{project_id}/versions/{version_id}/restore", response_model=DesignVersionItem
)
async def restore_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await version_service.restore_version(db, user, project_id, version_id)


# --- Template gallery ---
@router.get("/templates", response_model=list[TemplateListItem])
async def list_templates(
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await template_service.list_public(db, category=category)


@router.post("/projects/{project_id}/apply-template/{template_id}", response_model=MessageResponse)
async def apply_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await template_service.apply_to_project(db, user, project_id, template_id)


# --- Artisan share links (BR-101) ---
@router.post(
    "/projects/{project_id}/artisan-links", response_model=ArtisanLinkCreated, status_code=201
)
async def create_artisan_link(
    project_id: uuid.UUID,
    body: ArtisanLinkCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await artisan_service.create_link(db, user, project_id, body.export_id)


@router.get("/projects/{project_id}/artisan-links", response_model=list[ArtisanLinkResponse])
async def list_artisan_links(
    project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await artisan_service.list_links(db, user, project_id)


@router.post("/artisan-links/{link_id}/revoke", response_model=MessageResponse)
async def revoke_artisan_link(
    link_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await artisan_service.revoke_link(db, user, link_id)


@router.post("/artisan-links/{link_id}/renew", response_model=ArtisanLinkResponse)
async def renew_artisan_link(
    link_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await artisan_service.renew_link(db, user, link_id)


# --- Reference pack (BR-71) ---
@router.get("/projects/{project_id}/reference-pack")
async def download_reference_pack(
    project_id: uuid.UUID,
    token: str | None = Query(default=None, max_length=128),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    data, filename = await reference_pack_service.build_for_project(
        db, user, project_id, token=token
    )
    return attachment_response(data, "application/pdf", filename)
