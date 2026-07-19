import asyncio
import base64
import hashlib
import hmac
import json
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import jwt as pyjwt
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AccountBanned,
    AuthEditorLaunchInvalid,
    AuthRateLimited,
    AuthRefreshInvalid,
    AuthRoleForbidden,
    AuthSessionNotFound,
    AuthSSOInvalid,
    AuthTokenExpired,
    AuthTokenInvalid,
    AuthUserSuspended,
    EmailAlreadyTaken,
    EmailNotVerified,
    GoogleNoEmail,
    GoogleOnlyAccount,
    InvalidCredentials,
    OAuthFailed,
    OAuthStateMismatch,
    OTPExpired,
    OTPInvalid,
    OTPLocked,
    OTPResendCooldown,
    OTPResendLimit,
    PasswordResetInvalid,
    PasswordResetLocked,
    ProjectNotFound,
    UsernameAlreadyTaken,
)
from app.infrastructure import google_oauth, otp_store, rate_limiter, recovery_store, task_queue
from app.repositories import (
    monthly_usage_repo,
    plan_repo,
    project_repo,
    refresh_token_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.auth import (
    AccessTokenResponse,
    EditorLaunchClaimResponse,
    EditorLaunchCreateResponse,
    EditorLaunchExchangeResponse,
    EditorSessionResponse,
    ForgotPasswordResponse,
    GoogleLoginResponse,
    OTPResendResponse,
    RegisterResponse,
    SessionListResponse,
    SessionResponse,
    SSOCreateResponse,
    SSOVerifyResponse,
    TokenResponse,
)
from app.utils.jwt import (
    create_access_token,
    create_editor_access_token,
    create_raw_refresh_token,
    create_sso_token,
    decode_access_token,
    decode_editor_access_token,
    decode_sso_token,
    hash_token,
)
from app.utils.password import hash_password, verify_password

# ── UC-AUTH-001: Registration ────────────────────────────────────────────────


async def register_user(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    username: str,
    password: str,
    full_name: str,
) -> RegisterResponse:
    if await user_repo.get_by_email_any(db, email):
        raise EmailAlreadyTaken()

    if await user_repo.get_by_username_any(db, username):
        raise UsernameAlreadyTaken()

    first_name, last_name = _split_full_name(full_name)
    password_hash = hash_password(password)

    user = await user_repo.create_email_user(
        db,
        email=email,
        username=username,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
    )

    # Create free subscription
    free_plan = await plan_repo.get_free_plan(db)
    if free_plan:
        await subscription_repo.create_free(db, user_id=user.id, plan_id=free_plan.id)

    await monthly_usage_repo.create_for_user(db, user_id=user.id)

    # Make the account durable before creating external OTP/email side effects.
    await db.commit()
    code = otp_store.generate_otp()
    await otp_store.set_otp(redis, str(user.id), code)
    task_queue.enqueue_verification_email(user.email, code)

    return RegisterResponse(
        user_id=user.id,
        email=user.email,
        message="Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.",
    )


# ── UC-AUTH-002: OTP Verification ────────────────────────────────────────────


async def verify_otp(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    user_id: str,
    otp_code: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenResponse:
    # Check lockout
    lock_ttl = await otp_store.get_lock_ttl(redis, user_id)
    if lock_ttl is not None:
        remaining_minutes = max(1, (lock_ttl + 59) // 60)
        raise OTPLocked(remaining_minutes=remaining_minutes)

    data = await otp_store.get_otp_data(redis, user_id)
    if data is None:
        raise OTPExpired()

    # Constant-time comparison
    if not hmac.compare_digest(data["code"], otp_code):
        attempts = await otp_store.increment_attempts(redis, user_id)
        if attempts >= 5:
            await otp_store.set_lock(redis, user_id)
            await otp_store.delete_otp(redis, user_id)
            raise OTPLocked()
        raise OTPInvalid(remaining=5 - attempts)

    # Correct OTP
    uid = uuid.UUID(user_id)
    await user_repo.set_verified(db, uid)
    await otp_store.delete_otp(redis, user_id)

    user = await user_repo.get_by_id(db, uid)
    return await _issue_tokens(db, user, user_agent=user_agent, ip_address=ip_address)


# ── UC-AUTH-002: Resend OTP ───────────────────────────────────────────────────


async def resend_otp(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    user_id: str,
) -> OTPResendResponse:
    lock_ttl = await otp_store.get_lock_ttl(redis, user_id)
    if lock_ttl is not None:
        remaining_minutes = max(1, (lock_ttl + 59) // 60)
        raise OTPLocked(remaining_minutes=remaining_minutes)

    data = await otp_store.get_otp_data(redis, user_id)
    if data is None:
        raise OTPExpired()

    if data["resend_count"] >= 2:
        raise OTPResendLimit()

    # Cooldown check
    if data["resend_at"] is not None:
        last_resend = datetime.fromisoformat(data["resend_at"])
        elapsed = (datetime.now(UTC) - last_resend).total_seconds()
        if elapsed < 60:
            raise OTPResendCooldown(remaining_seconds=int(60 - elapsed))

    new_code = otp_store.generate_otp()
    await otp_store.update_resend(redis, user_id, new_code)

    # Fetch user email for sending
    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if user:
        task_queue.enqueue_verification_email(user.email, new_code)

    resend_remaining = 2 - (data["resend_count"] + 1)
    return OTPResendResponse(
        message="Mã mới đã được gửi. Vui lòng kiểm tra email.",
        resend_remaining=resend_remaining,
    )


# ── UC-AUTH-003: Login email/password ────────────────────────────────────────


async def login_user(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    password: str,
    client_ip: str,
    user_agent: str | None = None,
) -> TokenResponse:
    from app.config import settings

    await _enforce_rate_limit(
        redis,
        bucket="login-ip",
        identifier=client_ip,
        limit=settings.LOGIN_RATE_LIMIT,
        window_seconds=settings.LOGIN_RATE_WINDOW_SECONDS,
    )
    await _enforce_rate_limit(
        redis,
        bucket="login-account",
        identifier=email,
        limit=settings.LOGIN_RATE_LIMIT,
        window_seconds=settings.LOGIN_RATE_WINDOW_SECONDS,
    )
    user = await user_repo.get_by_email(db, email)

    # User enumeration prevention: treat missing user same as wrong password
    if not user or not user.password_hash:
        if user and not user.password_hash:
            # Google-only account — reveal specific error (not enumeration risk,
            # because we already know the email belongs to a valid account)
            raise GoogleOnlyAccount()
        await asyncio.sleep(0.3)
        raise InvalidCredentials()

    if not verify_password(password, user.password_hash):
        await asyncio.sleep(0.3)
        raise InvalidCredentials()

    if not user.is_verified:
        raise EmailNotVerified(user_id=str(user.id))

    if user.status != "active":
        raise AccountBanned()

    return await _issue_tokens(db, user, user_agent=user_agent, ip_address=client_ip)


# ── UC-AUTH-004: Google OAuth ─────────────────────────────────────────────────


async def get_google_auth_url(redis: aioredis.Redis) -> str:
    state = secrets.token_hex(32)
    await redis.set(f"oauth:state:{state}", "1", ex=600)
    return google_oauth.create_authorization_url(state)


async def handle_google_callback(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    code: str,
    state: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> GoogleLoginResponse:
    # Verify state
    state_key = f"oauth:state:{state}"
    if not await redis.get(state_key):
        raise OAuthStateMismatch()
    await redis.delete(state_key)

    try:
        userinfo = await google_oauth.fetch_user_info(code)
    except Exception:
        raise OAuthFailed()

    google_id: str = userinfo.get("sub", "")
    email: str | None = userinfo.get("email")
    given_name: str = userinfo.get("given_name", "")
    family_name: str = userinfo.get("family_name", "")

    if not email:
        raise GoogleNoEmail()

    # AF-1: Existing Google user
    existing = await user_repo.get_by_google_id(db, google_id)
    if existing:
        if existing.status != "active":
            raise AccountBanned()
        tokens = await _issue_tokens(db, existing, user_agent=user_agent, ip_address=ip_address)
        return GoogleLoginResponse(**tokens.model_dump(), is_new_user=False)

    # AF-2: Auto-link — email/password account with same email
    by_email = await user_repo.get_by_email(db, email)
    if by_email:
        await user_repo.set_verified_google_link(db, by_email, google_id)
        if by_email.status != "active":
            raise AccountBanned()
        tokens = await _issue_tokens(db, by_email, user_agent=user_agent, ip_address=ip_address)
        return GoogleLoginResponse(**tokens.model_dump(), is_new_user=False, linked=True)

    # New user via Google
    username = await _generate_unique_username(db, given_name, family_name, email)
    new_user = await user_repo.create_google_user(
        db,
        email=email,
        google_id=google_id,
        first_name=given_name or email.split("@")[0],
        last_name=family_name or "",
        username=username,
    )
    free_plan = await plan_repo.get_free_plan(db)
    if free_plan:
        await subscription_repo.create_free(db, user_id=new_user.id, plan_id=free_plan.id)
    await monthly_usage_repo.create_for_user(db, user_id=new_user.id)

    tokens = await _issue_tokens(db, new_user, user_agent=user_agent, ip_address=ip_address)
    return GoogleLoginResponse(**tokens.model_dump(), is_new_user=True)


# ── UC-AUTH-005: Admin/Staff Login ───────────────────────────────────────────


async def login_admin(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    password: str,
    client_ip: str,
    user_agent: str | None = None,
) -> dict:
    from app.config import settings

    await _enforce_rate_limit(
        redis,
        bucket="admin-login-ip",
        identifier=client_ip,
        limit=settings.LOGIN_RATE_LIMIT,
        window_seconds=settings.LOGIN_RATE_WINDOW_SECONDS,
    )
    user = await user_repo.get_admin_by_email(db, email)

    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise InvalidCredentials()

    if user.status != "active":
        raise AccountBanned()

    tokens = await _issue_tokens(db, user, user_agent=user_agent, ip_address=client_ip)
    return {**tokens.model_dump(), "role": user.role}


async def authenticate_user_access_token(db: AsyncSession, raw_token: str):
    user = await _authenticate_access_token(db, raw_token, allowed_roles={"user"})
    if not user.is_verified:
        raise EmailNotVerified(user_id=str(user.id))
    return user


async def authenticate_admin_access_token(db: AsyncSession, raw_token: str):
    return await _authenticate_access_token(db, raw_token, allowed_roles={"admin", "staff"})


async def _authenticate_access_token(
    db: AsyncSession,
    raw_token: str,
    *,
    allowed_roles: set[str],
):
    try:
        payload = decode_access_token(raw_token)
        if payload.get("type") != "access":
            raise AuthTokenInvalid()
        if payload.get("role") not in allowed_roles:
            raise AuthRoleForbidden()
        user_id = payload["sub"]
    except pyjwt.ExpiredSignatureError:
        raise AuthTokenExpired()
    except (pyjwt.InvalidTokenError, KeyError):
        raise AuthTokenInvalid()

    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise AuthTokenInvalid()
    if user.status != "active":
        raise AuthUserSuspended()
    return user


async def refresh_access_token(
    db: AsyncSession,
    redis: aioredis.Redis,
    raw_token: str,
    *,
    client_ip: str,
) -> AccessTokenResponse:
    from app.config import settings

    await _enforce_rate_limit(
        redis,
        bucket="refresh-ip",
        identifier=client_ip,
        limit=settings.REFRESH_RATE_LIMIT,
        window_seconds=settings.REFRESH_RATE_WINDOW_SECONDS,
    )
    token = await refresh_token_repo.get_by_hash(db, hash_token(raw_token))
    if not token or not token.is_valid or token.last_used_at is not None:
        raise AuthRefreshInvalid()
    user = await user_repo.get_by_id(db, token.user_id)
    if not user or user.status != "active":
        raise AuthRefreshInvalid()
    await refresh_token_repo.mark_used(db, token, ip_address=client_ip)
    return AccessTokenResponse(access_token=create_access_token(str(user.id), role=user.role))


async def logout(
    db: AsyncSession,
    user,
    raw_token: str,
    *,
    reject_used: bool = False,
) -> dict[str, str]:
    token = await refresh_token_repo.get_by_hash(db, hash_token(raw_token))
    if (
        not token
        or token.user_id != user.id
        or not token.is_valid
        or (reject_used and token.last_used_at is not None)
    ):
        raise AuthRefreshInvalid()
    await refresh_token_repo.revoke(db, token.id)
    return {"message": "Đăng xuất thành công"}


async def request_password_reset(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    client_ip: str,
) -> ForgotPasswordResponse:
    from app.config import settings

    for bucket, identifier in (("password-reset-ip", client_ip), ("password-reset-email", email)):
        await _enforce_rate_limit(
            redis,
            bucket=bucket,
            identifier=identifier,
            limit=settings.PASSWORD_RESET_RATE_LIMIT,
            window_seconds=settings.PASSWORD_RESET_RATE_WINDOW_SECONDS,
        )

    user = await user_repo.get_by_email(db, email)
    if user and user.password_hash and user.is_verified and user.status == "active":
        code = otp_store.generate_otp()
        await recovery_store.set_code(redis, user.email, code)
        task_queue.enqueue_password_reset_email(user.email, code)

    return ForgotPasswordResponse(
        message="Nếu email hợp lệ, mã khôi phục sẽ được gửi trong ít phút."
    )


async def reset_password(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    otp_code: str,
    new_password: str,
) -> dict[str, str]:
    result = await recovery_store.verify_code(redis, email, otp_code)
    if result == "locked":
        raise PasswordResetLocked()
    if result != "valid":
        raise PasswordResetInvalid()

    user = await user_repo.get_by_email(db, email)
    if not user or not user.password_hash or user.status != "active":
        raise PasswordResetInvalid()

    await user_repo.set_password_hash(db, user, hash_password(new_password))
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    await db.commit()
    await recovery_store.delete_code(redis, email)
    return {"message": "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại."}


async def list_sessions(db: AsyncSession, user) -> SessionListResponse:
    tokens = await refresh_token_repo.list_active_for_user(db, user.id)
    return SessionListResponse(
        items=[
            SessionResponse(
                id=token.id,
                user_agent=token.user_agent,
                ip_address=token.ip_address,
                created_at=token.created_at,
                last_used_at=token.last_used_at,
                expires_at=token.expires_at,
            )
            for token in tokens
        ]
    )


async def revoke_session(db: AsyncSession, user, session_id: uuid.UUID) -> dict[str, str]:
    token = await refresh_token_repo.get_active_for_user(db, user.id, session_id)
    if not token:
        raise AuthSessionNotFound()
    await refresh_token_repo.revoke(db, token.id)
    return {"message": "Đã thu hồi phiên đăng nhập"}


async def revoke_all_sessions(db: AsyncSession, user) -> dict[str, str]:
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    return {"message": "Đã thu hồi tất cả phiên đăng nhập"}


EDITOR_SCOPES = ["editor:read", "editor:write"]


async def create_editor_launch(
    db: AsyncSession,
    redis: aioredis.Redis,
    user,
    project_id: uuid.UUID,
) -> EditorLaunchCreateResponse:
    from app.config import settings

    if not await project_repo.get_owned_by_id(db, project_id, user.id):
        raise ProjectNotFound()

    ticket = await _store_opaque_record(
        redis,
        prefix="editor-launch-ticket",
        payload={"user_id": str(user.id), "project_id": str(project_id)},
        ttl=settings.EDITOR_LAUNCH_TICKET_EXPIRE_SECONDS,
    )
    desktop_url = f"{settings.EDITOR_DESKTOP_URL_SCHEME}://launch?{urlencode({'ticket': ticket})}"
    return EditorLaunchCreateResponse(
        launch_ticket=ticket,
        desktop_url=desktop_url,
        expires_in=settings.EDITOR_LAUNCH_TICKET_EXPIRE_SECONDS,
    )


async def claim_editor_launch(
    redis: aioredis.Redis,
    *,
    launch_ticket: str,
    code_challenge: str,
) -> EditorLaunchClaimResponse:
    from app.config import settings

    record = await _consume_opaque_record(redis, "editor-launch-ticket", launch_ticket)
    if not record:
        raise AuthEditorLaunchInvalid()
    authorization_code = await _store_opaque_record(
        redis,
        prefix="editor-auth-code",
        payload={**record, "code_challenge": code_challenge},
        ttl=settings.EDITOR_AUTH_CODE_EXPIRE_SECONDS,
    )
    return EditorLaunchClaimResponse(
        authorization_code=authorization_code,
        expires_in=settings.EDITOR_AUTH_CODE_EXPIRE_SECONDS,
    )


async def exchange_editor_launch(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    authorization_code: str,
    code_verifier: str,
) -> EditorLaunchExchangeResponse:
    from app.config import settings

    record = await _consume_opaque_record(redis, "editor-auth-code", authorization_code)
    if not record:
        raise AuthEditorLaunchInvalid()
    expected_challenge = str(record.get("code_challenge", ""))
    actual_challenge = _pkce_s256(code_verifier)
    if not hmac.compare_digest(expected_challenge, actual_challenge):
        raise AuthEditorLaunchInvalid()

    try:
        user_id = uuid.UUID(str(record["user_id"]))
        project_id = uuid.UUID(str(record["project_id"]))
    except (KeyError, TypeError, ValueError):
        raise AuthEditorLaunchInvalid()

    user = await user_repo.get_by_id(db, user_id)
    project = await project_repo.get_owned_by_id(db, project_id, user_id)
    if not user or user.status != "active" or not project:
        raise AuthEditorLaunchInvalid()

    access_token = create_editor_access_token(
        str(user_id),
        str(project_id),
        EDITOR_SCOPES,
    )
    return EditorLaunchExchangeResponse(
        access_token=access_token,
        expires_in=settings.EDITOR_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user_id,
        project_id=project_id,
        scopes=EDITOR_SCOPES,
    )


async def authenticate_editor_session(
    db: AsyncSession,
    raw_token: str,
) -> EditorSessionResponse:
    try:
        payload = decode_editor_access_token(raw_token)
        user_id = uuid.UUID(str(payload["sub"]))
        project_id = uuid.UUID(str(payload["project_id"]))
        scopes = payload.get("scope")
        expires_at = int(payload["exp"])
    except (pyjwt.PyJWTError, KeyError, TypeError, ValueError):
        raise AuthEditorLaunchInvalid()
    if not isinstance(scopes, list) or not set(EDITOR_SCOPES).issubset(scopes):
        raise AuthEditorLaunchInvalid()
    user = await user_repo.get_by_id(db, user_id)
    project = await project_repo.get_owned_by_id(db, project_id, user_id)
    if not user or user.status != "active" or not project:
        raise AuthEditorLaunchInvalid()
    return EditorSessionResponse(
        user_id=user_id,
        project_id=project_id,
        scopes=[str(scope) for scope in scopes],
        expires_at=expires_at,
    )


async def _store_opaque_record(
    redis: aioredis.Redis,
    *,
    prefix: str,
    payload: dict[str, str],
    ttl: int,
) -> str:
    for _ in range(3):
        raw_token = secrets.token_urlsafe(48)
        created = await redis.set(
            f"{prefix}:{hash_token(raw_token)}",
            json.dumps(payload, separators=(",", ":")),
            ex=ttl,
            nx=True,
        )
        if created:
            return raw_token
    raise RuntimeError("Unable to allocate a unique editor launch record")


async def _consume_opaque_record(
    redis: aioredis.Redis,
    prefix: str,
    raw_token: str,
) -> dict[str, str] | None:
    raw_record = await redis.getdel(f"{prefix}:{hash_token(raw_token)}")
    if not raw_record:
        return None
    try:
        decoded = json.loads(raw_record)
    except (TypeError, json.JSONDecodeError):
        return None
    return decoded if isinstance(decoded, dict) else None


def _pkce_s256(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


async def create_editor_sso(
    db: AsyncSession,
    redis: aioredis.Redis,
    user,
    project_id: uuid.UUID,
) -> SSOCreateResponse:
    from app.config import settings

    if not await project_repo.get_owned_by_id(db, project_id, user.id):
        raise ProjectNotFound()

    token = create_sso_token(str(user.id), str(project_id))
    await redis.set(
        f"sso:{hash_token(token)}", str(user.id), ex=settings.SSO_TOKEN_EXPIRE_MINUTES * 60
    )
    return SSOCreateResponse(
        sso_token=token,
        expires_in=settings.SSO_TOKEN_EXPIRE_MINUTES * 60,
    )


async def verify_editor_sso(
    db: AsyncSession, redis: aioredis.Redis, token: str
) -> SSOVerifyResponse:
    key = f"sso:{hash_token(token)}"
    try:
        payload = decode_sso_token(token)
    except pyjwt.InvalidTokenError:
        raise AuthSSOInvalid()
    if not await redis.getdel(key):
        raise AuthSSOInvalid()
    user = await user_repo.get_by_id(db, payload["sub"])
    if not user or user.status != "active":
        raise AuthSSOInvalid()
    try:
        project_id = uuid.UUID(str(payload["project_id"]))
    except (KeyError, TypeError, ValueError):
        raise AuthSSOInvalid()
    if not await project_repo.get_owned_by_id(db, project_id, user.id):
        raise AuthSSOInvalid()

    return SSOVerifyResponse(
        user_id=user.id,
        project_id=project_id,
        email=user.email,
        username=user.username,
    )


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _issue_tokens(
    db: AsyncSession,
    user,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenResponse:
    from app.config import settings

    access_token = create_access_token(str(user.id), role=user.role)
    raw_refresh = create_raw_refresh_token()
    token_hash = hash_token(raw_refresh)
    expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    await refresh_token_repo.create(
        db,
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent=user_agent[:1000] if user_agent else None,
        ip_address=ip_address,
    )

    return TokenResponse(access_token=access_token, refresh_token=raw_refresh)


async def _enforce_rate_limit(
    redis: aioredis.Redis,
    *,
    bucket: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    retry_after = await rate_limiter.consume(
        redis,
        bucket=bucket,
        identifier=identifier,
        limit=limit,
        window_seconds=window_seconds,
    )
    if retry_after is not None:
        raise AuthRateLimited(retry_after)


async def _generate_unique_username(
    db: AsyncSession,
    given_name: str,
    family_name: str,
    email: str,
) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "", f"{given_name}{family_name}").lower()
    if len(base) < 3:
        base = email.split("@")[0]
        base = re.sub(r"[^a-zA-Z0-9_]", "", base).lower()
    if len(base) < 3:
        base = "user"

    base = base[:25]
    candidate = base
    if not await user_repo.get_by_username_any(db, candidate):
        return candidate

    for _ in range(10):
        candidate = f"{base}{secrets.randbelow(10000)}"
        if not await user_repo.get_by_username_any(db, candidate):
            return candidate

    return f"{base}{secrets.token_hex(4)}"


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]
