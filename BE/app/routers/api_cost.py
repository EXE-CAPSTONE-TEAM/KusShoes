"""SF-14 / BR-79 API cost intake (service token) and admin budget (SRS_v2.2.txt:1767)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write, verify_service_token
from app.schemas.api_cost import (
    ApiBudgetStatus,
    ApiBudgetUpdate,
    ApiCostDailyRow,
    ApiCostEntryResponse,
    ApiCostRecordRequest,
    ScanIntakeResponse,
)
from app.services import api_cost_service

internal_router = APIRouter(dependencies=[Depends(verify_service_token)])
admin_router = APIRouter()


@internal_router.post("/calls", response_model=ApiCostEntryResponse, status_code=201)
async def record_api_call(body: ApiCostRecordRequest, db: AsyncSession = Depends(get_db)):
    return await api_cost_service.record_call(db, body)


@internal_router.get("/scan-intake", response_model=ScanIntakeResponse)
async def scan_intake(user_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    return await api_cost_service.scan_intake(db, user_id)


@admin_router.get("/daily", response_model=list[ApiCostDailyRow])
async def api_cost_daily(
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await api_cost_service.list_daily(db, date_from=date_from, date_to=date_to)


@admin_router.get("/budget", response_model=ApiBudgetStatus)
async def get_api_budget(
    month: date | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await api_cost_service.get_budget(db, month)


@admin_router.put("/budget", response_model=ApiBudgetStatus)
async def set_api_budget(
    body: ApiBudgetUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await api_cost_service.set_budget(db, admin, body)
