import uuid
from typing import Literal
from urllib.parse import urlencode

import redis.asyncio as aioredis
from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import (
    get_current_user,
    get_editor_session,
    get_redis,
    verify_service_token,
)
from app.exceptions import AppException, AuthRefreshInvalid
from app.schemas.auth import (
    AccessTokenResponse,
    AccountRestoreConfirmRequest,
    EditorLaunchClaimRequest,
    EditorLaunchClaimResponse,
    EditorLaunchCreateRequest,
    EditorLaunchCreateResponse,
    EditorLaunchExchangeRequest,
    EditorLaunchExchangeResponse,
    EditorSessionResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleMobileExchangeRequest,
    LoginRequest,
    LoginResult,
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
    SSODesktopSessionResponse,
    SSOVerifyRequest,
    SSOVerifyResponse,
    TokenResponse,
    TwoFactorLoginVerifyRequest,
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
        utm_source=body.utm_source,
        utm_campaign=body.utm_campaign,
        referral_code=body.referral_code,
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


@router.post("/login", response_model=LoginResult)
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
    if isinstance(result, LoginResult):
        return result
    _set_refresh_cookie(response, result.refresh_token)
    return LoginResult(access_token=result.access_token, token_type=result.token_type)


@router.post("/2fa/verify", response_model=TokenResponse)
async def verify_two_factor_login(
    body: TwoFactorLoginVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    result = await auth_service.verify_two_factor_login(
        db,
        redis,
        challenge_token=body.challenge_token,
        code=body.code,
        recovery_code=body.recovery_code,
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_refresh_cookie(response, result.refresh_token)
    return TokenResponse(access_token=result.access_token, token_type=result.token_type)


@router.get("/google")
async def google_login(
    client: Literal["web", "mobile"] = "web",
    code_challenge: str | None = Query(default=None, pattern=r"^[A-Za-z0-9_-]{43}$"),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Start Google sign-in. The mobile app passes `client=mobile` plus its PKCE S256 challenge."""
    if client == auth_service.GOOGLE_CLIENT_MOBILE and not code_challenge:
        raise RequestValidationError(
            [
                {
                    "type": "missing",
                    "loc": ("query", "code_challenge"),
                    "msg": "code_challenge is required for mobile sign-in",
                    "input": None,
                }
            ]
        )
    url = await auth_service.get_google_auth_url(
        redis, client=client, code_challenge=code_challenge
    )
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Finish Google sign-in and send the browser back to the web app.

    The web app (PUBLIC_WEB_URL, e.g. on Vercel) is a different site from the API, so the session
    travels in the URL *fragment* of `/auth/google/callback` — fragments are never sent to a server
    or written to access logs. The refresh token is set as the usual HttpOnly cookie.

    A mobile sign-in instead returns to MOBILE_GOOGLE_REDIRECT_URI with a one-time `code` that
    only the app holding the PKCE verifier can exchange (`POST /auth/google/mobile/exchange`).
    """
    started_by = await auth_service.peek_google_state(redis, state)
    if started_by.get("client") == auth_service.GOOGLE_CLIENT_MOBILE:
        return await _finish_mobile_google_login(request, db, redis, code, state, started_by)

    target = f"{settings.PUBLIC_WEB_URL.rstrip('/')}/auth/google/callback"
    try:
        result = await auth_service.handle_google_callback(
            db,
            redis,
            code=code,
            state=state,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
    except AppException as exc:
        return RedirectResponse(
            url=f"{target}#{urlencode({'error': exc.code})}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    fragment = urlencode(
        {
            "access_token": result["access_token"],
            "token_type": result["token_type"],
            "is_new_user": str(bool(result["is_new_user"])).lower(),
            "linked": str(bool(result["linked"])).lower(),
        }
    )
    redirect = RedirectResponse(url=f"{target}#{fragment}", status_code=status.HTTP_303_SEE_OTHER)
    _set_refresh_cookie(redirect, result["refresh_token"])
    return redirect


async def _finish_mobile_google_login(
    request: Request,
    db: AsyncSession,
    redis: aioredis.Redis,
    code: str,
    state: str,
    started_by: dict[str, str],
) -> RedirectResponse:
    target = settings.MOBILE_GOOGLE_REDIRECT_URI
    try:
        result = await auth_service.handle_google_callback(
            db,
            redis,
            code=code,
            state=state,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
    except AppException as exc:
        return RedirectResponse(
            url=f"{target}?{urlencode({'error': exc.code})}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
    one_time_code = await auth_service.create_mobile_google_code(
        redis, tokens=result, code_challenge=started_by.get("code_challenge", "")
    )
    # No cookie here: the browser tab is not the app's HTTP client. The exchange sets it.
    return RedirectResponse(
        url=f"{target}?{urlencode({'code': one_time_code})}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.post("/google/mobile/exchange", response_model=TokenResponse)
async def google_mobile_exchange(
    body: GoogleMobileExchangeRequest,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
):
    """Trade the mobile one-time code + PKCE verifier for the session (same shape as /login)."""
    tokens = await auth_service.exchange_mobile_google_code(
        redis, code=body.code, code_verifier=body.code_verifier
    )
    _set_refresh_cookie(response, tokens.refresh_token)
    return TokenResponse(access_token=tokens.access_token, token_type=tokens.token_type)


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


@router.post("/desktop-session", response_model=SSODesktopSessionResponse)
async def create_desktop_session(
    body: SSOVerifyRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.exchange_editor_sso(db, redis, body.sso_token)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post(
    "/restore-account/request",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_account_restore(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.request_account_restore(
        db, redis, email=body.email, client_ip=_client_ip(request)
    )


@router.post("/restore-account/confirm")
async def confirm_account_restore(
    body: AccountRestoreConfirmRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await auth_service.confirm_account_restore(
        db, redis, email=body.email, otp_code=body.otp_code
    )
