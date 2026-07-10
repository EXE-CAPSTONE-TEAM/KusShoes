import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Body, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, get_redis, verify_service_token
from app.exceptions import AuthRefreshInvalid
from app.schemas.auth import (
    AccessTokenResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleLoginResponse,
    LoginRequest,
    LogoutRequest,
    OTPResendRequest,
    OTPResendResponse,
    OTPVerifyRequest,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    SessionListResponse,
    SSODesktopSessionResponse,
    SSOCreateRequest,
    SSOCreateResponse,
    SSOVerifyRequest,
    SSOVerifyResponse,
    TokenResponse,
)
from app.services import auth_service

router = APIRouter()


def _set_refresh_cookie(response: Response, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.is_production,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path="/api/v1",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.is_production,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path="/api/v1",
    )


def _refresh_token_from_request(
    request: Request,
    body: RefreshTokenRequest | LogoutRequest | None,
) -> str:
    token = body.refresh_token if body else None
    token = token or request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise AuthRefreshInvalid()
    return token


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.register_user(
        db,
        redis,
        email=body.email,
        username=body.username,
        password=body.password,
        full_name=body.full_name,
        client_ip=_client_ip(request),
    )


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: OTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    result = await auth_service.verify_otp(
        db,
        redis,
        user_id=str(body.user_id),
        otp_code=body.otp_code,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    _set_refresh_cookie(response, result.refresh_token)
    return TokenResponse(access_token=result.access_token, token_type=result.token_type)


@router.post("/resend-otp", response_model=OTPResendResponse)
async def resend_otp(
    body: OTPResendRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.resend_otp(
        db,
        redis,
        user_id=str(body.user_id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    result = await auth_service.login_user(
        db,
        redis,
        email=body.email,
        password=body.password,
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_refresh_cookie(response, result.refresh_token)
    return TokenResponse(access_token=result.access_token, token_type=result.token_type)


@router.get("/google")
async def google_login(
    redis: aioredis.Redis = Depends(get_redis),
):
    url = await auth_service.get_google_auth_url(redis)
    return RedirectResponse(url=url)


@router.get("/google/callback", response_model=GoogleLoginResponse)
async def google_callback(
    request: Request,
    response: Response,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    result = await auth_service.handle_google_callback(
        db,
        redis,
        code=code,
        state=state,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    _set_refresh_cookie(response, result["refresh_token"])
    return GoogleLoginResponse(
        access_token=result["access_token"],
        token_type=result["token_type"],
        is_new_user=result["is_new_user"],
        linked=result["linked"],
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    result = await auth_service.refresh_access_token(
        db, redis, _refresh_token_from_request(request, body), client_ip=_client_ip(request)
    )
    _set_refresh_cookie(response, result.refresh_token)
    return AccessTokenResponse(access_token=result.access_token, token_type=result.token_type)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    body: LogoutRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        return await auth_service.logout(
            db, user, _refresh_token_from_request(request, body)
        )
    finally:
        _clear_refresh_cookie(response)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.request_password_reset(
        db, redis, email=body.email, client_ip=_client_ip(request)
    )


@router.post("/reset-password", response_model=ForgotPasswordResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.reset_password(
        db,
        redis,
        email=body.email,
        otp_code=body.otp_code,
        new_password=body.new_password,
    )


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await auth_service.list_sessions(db, user)


@router.delete("/sessions/{session_id}", response_model=ForgotPasswordResponse)
async def revoke_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await auth_service.revoke_session(db, user, session_id)


@router.delete("/sessions", response_model=ForgotPasswordResponse)
async def revoke_all_sessions(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await auth_service.revoke_all_sessions(db, user)


@router.post("/sso-token", response_model=SSOCreateResponse)
async def create_sso_token(
    body: SSOCreateRequest,
    redis: aioredis.Redis = Depends(get_redis),
    user=Depends(get_current_user),
):
    return await auth_service.create_editor_sso(redis, user, body.project_id)


@router.post("/verify-sso", response_model=SSOVerifyResponse)
async def verify_sso(
    body: SSOVerifyRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: None = Depends(verify_service_token),
):
    return await auth_service.verify_editor_sso(db, redis, body.sso_token)


@router.post("/desktop-session", response_model=SSODesktopSessionResponse)
async def create_desktop_session(
    body: SSOVerifyRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.exchange_editor_sso(db, redis, body.sso_token)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
