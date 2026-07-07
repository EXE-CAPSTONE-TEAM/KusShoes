import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_redis
from app.schemas.auth import AdminLoginResponse, LoginRequest, LogoutRequest
from app.services import auth_service

router = APIRouter()


@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    client_ip = request.client.host if request.client else "unknown"
    result = await auth_service.login_admin(
        db,
        redis,
        email=body.email,
        password=body.password,
        client_ip=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    return result


@router.post("/auth/logout")
async def admin_logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await auth_service.logout(db, admin, body.refresh_token, reject_used=True)
