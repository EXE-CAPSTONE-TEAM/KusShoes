import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.admin import AdminPlanResponse, PlanUpdateRequest
from app.services import admin_service

router = APIRouter()


@router.get("/plans", response_model=list[AdminPlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.list_plans_admin(db)


@router.patch("/plans/{plan_id}", response_model=AdminPlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    changes = body.model_dump(exclude_unset=True)
    return await admin_service.update_plan(db, admin, plan_id, changes)
