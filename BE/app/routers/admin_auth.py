import redis.asyncio as aioredis
from fastapi import APIRouter, Body, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_redis
from app.schemas.auth import AdminLoginResponse, LoginRequest, LogoutRequest
from app.routers.auth import (
    _clear_refresh_cookie,
    _refresh_token_from_request,
    _set_refresh_cookie,
)
from app.services import auth_service

router = APIRouter()


@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(
    body: LoginRequest,
    request: Request,
    response: Response,
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
    _set_refresh_cookie(response, result.get("refresh_token"))
    return AdminLoginResponse(
        access_token=result["access_token"],
        token_type=result["token_type"],
        role=result["role"],
    )


@router.post("/auth/logout")
async def admin_logout(
    request: Request,
    response: Response,
    body: LogoutRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        return await auth_service.logout(
            db,
            admin,
            _refresh_token_from_request(request, body),
            reject_used=True,
        )
    finally:
        _clear_refresh_cookie(response)
