import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_editor_session, get_redis, verify_service_token
from app.schemas.auth import (
    AccessTokenResponse,
    EditorLaunchClaimRequest,
    EditorLaunchClaimResponse,
    EditorLaunchCreateRequest,
    EditorLaunchCreateResponse,
    EditorLaunchExchangeRequest,
    EditorLaunchExchangeResponse,
    EditorSessionResponse,
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
    SSOCreateRequest,
    SSOCreateResponse,
    SSOVerifyRequest,
    SSOVerifyResponse,
    TokenResponse,
)
from app.services import auth_service

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(
    body: RegisterRequest,
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
    )


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: OTPVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.verify_otp(
        db,
        redis,
        user_id=str(body.user_id),
        otp_code=body.otp_code,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )


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
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.login_user(
        db,
        redis,
        email=body.email,
        password=body.password,
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/google")
async def google_login(
    redis: aioredis.Redis = Depends(get_redis),
):
    url = await auth_service.get_google_auth_url(redis)
    return RedirectResponse(url=url)


@router.get("/google/callback", response_model=GoogleLoginResponse)
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.handle_google_callback(
        db,
        redis,
        code=code,
        state=state,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.refresh_access_token(
        db, redis, body.refresh_token, client_ip=_client_ip(request)
    )


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await auth_service.logout(db, user, body.refresh_token)


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


@router.post("/editor/launch", response_model=EditorLaunchCreateResponse)
async def create_editor_launch(
    body: EditorLaunchCreateRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    user=Depends(get_current_user),
):
    return await auth_service.create_editor_launch(db, redis, user, body.project_id)


@router.post("/editor/launch/claim", response_model=EditorLaunchClaimResponse)
async def claim_editor_launch(
    body: EditorLaunchClaimRequest,
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.claim_editor_launch(
        redis,
        launch_ticket=body.launch_ticket,
        code_challenge=body.code_challenge,
    )


@router.post("/editor/launch/exchange", response_model=EditorLaunchExchangeResponse)
async def exchange_editor_launch(
    body: EditorLaunchExchangeRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.exchange_editor_launch(
        db,
        redis,
        authorization_code=body.authorization_code,
        code_verifier=body.code_verifier,
    )


@router.get("/editor/session", response_model=EditorSessionResponse)
async def get_current_editor_session(session=Depends(get_editor_session)):
    return session


@router.post("/sso-token", response_model=SSOCreateResponse)
async def create_sso_token(
    body: SSOCreateRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    user=Depends(get_current_user),
):
    return await auth_service.create_editor_sso(db, redis, user, body.project_id)


@router.post("/verify-sso", response_model=SSOVerifyResponse)
async def verify_sso(
    body: SSOVerifyRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: None = Depends(verify_service_token),
):
    return await auth_service.verify_editor_sso(db, redis, body.sso_token)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
