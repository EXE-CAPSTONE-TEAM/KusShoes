import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.studio import (
    AdminTemplateResponse,
    GuardrailRuleCreate,
    GuardrailRuleResponse,
    GuardrailRuleUpdate,
    TemplateCreate,
)
from app.schemas.user import MessageResponse
from app.services import guardrail_service, template_service

router = APIRouter()


# --- Content guardrail (BR-54) ---
@router.get("/guardrail-rules", response_model=list[GuardrailRuleResponse])
async def list_rules(db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)):
    return await guardrail_service.list_rules(db)


@router.post("/guardrail-rules", response_model=GuardrailRuleResponse, status_code=201)
async def create_rule(
    body: GuardrailRuleCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await guardrail_service.create_rule(db, admin, kind=body.kind, term=body.term)


@router.patch("/guardrail-rules/{rule_id}", response_model=GuardrailRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    body: GuardrailRuleUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await guardrail_service.set_rule_active(db, admin, rule_id, body.is_active)


@router.delete("/guardrail-rules/{rule_id}", response_model=MessageResponse)
async def delete_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await guardrail_service.delete_rule(db, admin, rule_id)
    return {"message": "Đã xóa quy tắc"}


# --- Template gallery ---
@router.get("/templates", response_model=list[AdminTemplateResponse])
async def list_templates(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await template_service.list_admin(db, status=status)


@router.post("/templates", response_model=AdminTemplateResponse, status_code=201)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await template_service.create_template(db, admin, body)


@router.post("/templates/{template_id}/approve", response_model=AdminTemplateResponse)
async def approve_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await template_service.review_template(db, admin, template_id, approve=True)


@router.post("/templates/{template_id}/reject", response_model=AdminTemplateResponse)
async def reject_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await template_service.review_template(db, admin, template_id, approve=False)
