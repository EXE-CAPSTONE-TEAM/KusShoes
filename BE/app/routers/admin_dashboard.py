from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.admin import AdminRecentUserItem, AdminStatsResponse, MonthlyPoint
from app.services import admin_service

router = APIRouter()


@router.get("/dashboard/stats", response_model=AdminStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_dashboard_stats(db)


@router.get("/dashboard/revenue", response_model=list[MonthlyPoint])
async def get_revenue(
    months: int = Query(default=12, ge=1, le=36),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_revenue_series(db, months=months)


@router.get("/dashboard/user-growth", response_model=list[MonthlyPoint])
async def get_user_growth(
    months: int = Query(default=6, ge=1, le=36),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_user_growth_series(db, months=months)


@router.get("/dashboard/recent-users", response_model=list[AdminRecentUserItem])
async def get_recent_users(
    limit: int = Query(default=5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_recent_users(db, limit=limit)
