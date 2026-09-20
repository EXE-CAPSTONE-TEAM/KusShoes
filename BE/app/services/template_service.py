import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import DesignLayerLimitExceeded, ProjectLocked, TemplateNotFound
from app.repositories import design_template_repo, project_repo, subscription_repo
from app.schemas.studio import TemplateCreate
from app.services import guardrail_service, version_service
from app.services.audit import record_audit
from app.services.project_service import count_design_layers, require_owner


async def list_public(db: AsyncSession, *, category: str | None):
    return await design_template_repo.list_templates(db, status="approved", category=category)


async def apply_to_project(
    db: AsyncSession, user, project_id: uuid.UUID, template_id: uuid.UUID
) -> dict[str, str]:
    project = await require_owner(db, project_id, user)
    if project.is_locked:
        raise ProjectLocked()
    template = await design_template_repo.get_by_id(db, template_id)
    if not template or template.status != "approved":
        raise TemplateNotFound()
    await guardrail_service.assert_not_exporting(db, project_id)
    subscription = await subscription_repo.get_by_user(db, user.id)
    max_layers = subscription.plan.max_layers_per_project if subscription else 30
    if template.layer_count > max_layers:
        raise DesignLayerLimitExceeded()
    design_config = dict(template.design_config)
    await project_repo.save_design(
        db, project, design_config=design_config, thumbnail_path=project.thumbnail_path
    )
    await version_service.snapshot(
        db, project, design_config=design_config, thumbnail_path=project.thumbnail_path
    )
    template.use_count += 1
    await db.commit()
    return {"message": "Đã áp dụng template"}


# --- Admin ----------------------------------------------------------------------------


async def list_admin(db: AsyncSession, *, status: str | None):
    return await design_template_repo.list_templates(db, status=status)


async def create_template(db: AsyncSession, admin, body: TemplateCreate):
    """Guardrail applies to templates too: banned/trademark text never reaches the gallery."""
    await guardrail_service.check_design(db, body.design_config)
    template = await design_template_repo.create(
        db,
        name=body.name,
        description=body.description,
        category=body.category,
        design_config=body.design_config,
        thumbnail_path=body.thumbnail_path,
        layer_count=count_design_layers(body.design_config),
        status="pending",
        created_by=admin.id,
    )
    await record_audit(
        db, admin, "template.create", target_type="template", target_id=template.id
    )
    await db.commit()
    return template


async def review_template(db: AsyncSession, admin, template_id: uuid.UUID, *, approve: bool):
    template = await design_template_repo.get_by_id(db, template_id)
    if not template:
        raise TemplateNotFound()
    template.status = "approved" if approve else "rejected"
    await record_audit(
        db,
        admin,
        "template.approve" if approve else "template.reject",
        target_type="template",
        target_id=template.id,
    )
    await db.commit()
    return template
