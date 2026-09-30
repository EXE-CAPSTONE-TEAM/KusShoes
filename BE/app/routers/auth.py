import html
import uuid
from typing import Literal
from urllib.parse import urlencode

import redis.asyncio as aioredis
from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, RedirectResponse
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
    GoogleDesktopExchangeRequest,
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
from app.utils.http import get_client_ip

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
        client=body.client,
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
    client: Literal["web", "mobile", "desktop"] = "web",
    code_challenge: str | None = Query(default=None, pattern=r"^[A-Za-z0-9_-]{43}$"),
    consent: bool = False,
    redis: aioredis.Redis = Depends(get_redis),
):
    """Start Google sign-in. Mobile and desktop apps pass `client=mobile|desktop` plus PKCE S256 challenge.

    `consent=true` means the user ticked the 18+ / Terms / Privacy box; without it a Google account
    that is not yet a KusShoes user is refused (AUTH_CONSENT_REQUIRED) instead of created.
    """
    if client in (auth_service.GOOGLE_CLIENT_MOBILE, auth_service.GOOGLE_CLIENT_DESKTOP) and not code_challenge:
        raise RequestValidationError(
            [
                {
                    "type": "missing",
                    "loc": ("query", "code_challenge"),
                    "msg": f"code_challenge is required for {client} sign-in",
                    "input": None,
                }
            ]
        )
    url = await auth_service.get_google_auth_url(
        redis, client=client, code_challenge=code_challenge, consent=consent
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
    """Finish Google sign-in and send the browser back to the web app, mobile app, or desktop editor.

    The web app (PUBLIC_WEB_URL, e.g. on Vercel) is a different site from the API, so the session
    travels in the URL *fragment* of `/auth/google/callback` — fragments are never sent to a server
    or written to access logs. The refresh token is set as the usual HttpOnly cookie.

    A mobile sign-in returns to MOBILE_GOOGLE_REDIRECT_URI with a one-time `code`.
    A desktop sign-in returns to DESKTOP_GOOGLE_REDIRECT_URI with a one-time `code`.
    """
    started_by = await auth_service.peek_google_state(redis, state)
    client_type = started_by.get("client")
    if client_type == auth_service.GOOGLE_CLIENT_MOBILE:
        return await _finish_mobile_google_login(request, db, redis, code, state, started_by)
    if client_type == auth_service.GOOGLE_CLIENT_DESKTOP:
        return await _finish_desktop_google_login(request, db, redis, code, state, started_by)

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


async def _finish_desktop_google_login(
    request: Request,
    db: AsyncSession,
    redis: aioredis.Redis,
    code: str,
    state: str,
    started_by: dict[str, str],
) -> Response:
    target = settings.DESKTOP_GOOGLE_REDIRECT_URI
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
        error_url = f"{target}?{urlencode({'error': exc.code})}"
        return _render_desktop_bridge_html(error_url, error=exc.code)

    one_time_code = await auth_service.create_desktop_google_code(
        redis, tokens=result, code_challenge=started_by.get("code_challenge", "")
    )
    redirect_url = f"{target}?{urlencode({'code': one_time_code})}"
    return _render_desktop_bridge_html(redirect_url)


def _render_desktop_bridge_html(url: str, error: str | None = None) -> HTMLResponse:
    escaped_url = html.escape(url)
    if error:
        escaped_error = html.escape(error)
        content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KusShoes Editor - Đăng nhập</title>
    <meta http-equiv="refresh" content="0;url={escaped_url}">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1115; color: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
        .card {{ background: #1a1d24; border: 1px solid #2e3440; border-radius: 12px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }}
        h1 {{ font-size: 20px; color: #ef4444; margin-bottom: 12px; }}
        p {{ font-size: 14px; color: #9ca3af; line-height: 1.5; }}
        .btn {{ display: inline-block; margin-top: 20px; padding: 10px 20px; background: #f97316; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Đăng nhập không thành công</h1>
        <p>Mã lỗi: {escaped_error}. Vui lòng quay lại KusShoes Editor để thử lại.</p>
        <a class="btn" href="{escaped_url}">Quay lại ứng dụng</a>
    </div>
    <script>window.location.href = "{escaped_url}";</script>
</body>
</html>"""
        return HTMLResponse(content=content, status_code=200)

    content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KusShoes Editor - Đang mở ứng dụng</title>
    <meta http-equiv="refresh" content="0;url={escaped_url}">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1115; color: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
        .card {{ background: #1a1d24; border: 1px solid #2e3440; border-radius: 12px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }}
        h1 {{ font-size: 20px; color: #f97316; margin-bottom: 12px; }}
        p {{ font-size: 14px; color: #9ca3af; line-height: 1.5; }}
        .btn {{ display: inline-block; margin-top: 20px; padding: 10px 20px; background: #f97316; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; }}
        .hint {{ font-size: 12px; color: #6b7280; margin-top: 16px; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Đăng nhập thành công!</h1>
        <p>Đang chuyển hướng về KusShoes Editor Desktop...</p>
        <a class="btn" href="{escaped_url}">Mở KusShoes Editor</a>
        <p class="hint">Nếu ứng dụng không tự mở, bấm nút trên hoặc bạn có thể đóng tab trình duyệt này.</p>
    </div>
    <script>window.location.href = "{escaped_url}";</script>
</body>
</html>"""
    return HTMLResponse(content=content, status_code=200)


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


@router.post("/google/desktop/exchange", response_model=TokenResponse)
async def google_desktop_exchange(
    body: GoogleDesktopExchangeRequest,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
):
    """Trade the desktop one-time code + PKCE verifier for the session (same shape as /login)."""
    tokens = await auth_service.exchange_desktop_google_code(
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
    return get_client_ip(request)


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
