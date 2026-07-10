import asyncio
import hmac
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AccountBanned,
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
    UsernameAlreadyTaken,
)
from app.infrastructure import google_oauth, otp_store, rate_limiter, recovery_store, task_queue
from app.repositories import (
    monthly_usage_repo,
    plan_repo,
    refresh_token_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.auth import (
    ForgotPasswordResponse,
    OTPResendResponse,
    RegisterResponse,
    SessionListResponse,
    SessionResponse,
    SSODesktopSessionResponse,
    SSOCreateResponse,
    SSOVerifyResponse,
)
from app.utils.jwt import (
    create_access_token,
    create_raw_refresh_token,
    create_sso_token,
    decode_access_token,
    decode_sso_token,
    hash_token,
)
from app.utils.password import hash_password, verify_password


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

# ── UC-AUTH-001: Registration ────────────────────────────────────────────────

async def register_user(
    db: AsyncSession,
    redis: aioredis.Redis,
    *,
    email: str,
    username: str,
    password: str,
    full_name: str,
    client_ip: str,
) -> RegisterResponse:
    from app.config import settings

    await _enforce_rate_limit(
        redis,
        bucket="register-ip",
        identifier=client_ip,
        limit=settings.REGISTER_RATE_LIMIT,
        window_seconds=settings.REGISTER_RATE_WINDOW_SECONDS,
    )

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
) -> IssuedTokens:
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
) -> IssuedTokens:
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
) -> dict:
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
        tokens = await _issue_tokens(
            db, existing, user_agent=user_agent, ip_address=ip_address
        )
        return {**tokens.__dict__, "is_new_user": False, "linked": False}

    # AF-2: Auto-link — email/password account with same email
    by_email = await user_repo.get_by_email(db, email)
    if by_email:
        await user_repo.set_verified_google_link(db, by_email, google_id)
        if by_email.status != "active":
            raise AccountBanned()
        tokens = await _issue_tokens(
            db, by_email, user_agent=user_agent, ip_address=ip_address
        )
        return {**tokens.__dict__, "is_new_user": False, "linked": True}

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
    return {**tokens.__dict__, "is_new_user": True, "linked": False}


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
    return {**tokens.__dict__, "role": user.role}


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
) -> IssuedTokens:
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
    raw_refresh = create_raw_refresh_token()
    await refresh_token_repo.create(
        db,
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=token.user_agent,
        ip_address=client_ip,
    )
    return IssuedTokens(
        access_token=create_access_token(str(user.id), role=user.role),
        refresh_token=raw_refresh,
    )


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


async def revoke_session(
    db: AsyncSession, user, session_id: uuid.UUID
) -> dict[str, str]:
    token = await refresh_token_repo.get_active_for_user(db, user.id, session_id)
    if not token:
        raise AuthSessionNotFound()
    await refresh_token_repo.revoke(db, token.id)
    return {"message": "Đã thu hồi phiên đăng nhập"}


async def revoke_all_sessions(db: AsyncSession, user) -> dict[str, str]:
    await refresh_token_repo.revoke_all_for_user(db, user.id)
    return {"message": "Đã thu hồi tất cả phiên đăng nhập"}


async def create_editor_sso(redis: aioredis.Redis, user, project_id) -> SSOCreateResponse:
    from app.config import settings

    token = create_sso_token(str(user.id), str(project_id))
    await redis.set(f"sso:{hash_token(token)}", str(user.id), ex=settings.SSO_TOKEN_EXPIRE_MINUTES * 60)
    return SSOCreateResponse(
        sso_token=token,
        expires_in=settings.SSO_TOKEN_EXPIRE_MINUTES * 60,
    )


async def verify_editor_sso(
    db: AsyncSession, redis: aioredis.Redis, token: str
) -> SSOVerifyResponse:
    user, payload = await _consume_editor_sso(db, redis, token)
    return SSOVerifyResponse(
        user_id=user.id,
        project_id=payload["project_id"],
        email=user.email,
        username=user.username,
    )


async def exchange_editor_sso(
    db: AsyncSession, redis: aioredis.Redis, token: str
) -> SSODesktopSessionResponse:
    user, payload = await _consume_editor_sso(db, redis, token)
    return SSODesktopSessionResponse(
        access_token=create_access_token(str(user.id), role=user.role),
        user_id=user.id,
        project_id=payload["project_id"],
        email=user.email,
        username=user.username,
        name=user.full_name.strip() or user.username,
        role=user.role,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def _consume_editor_sso(db: AsyncSession, redis: aioredis.Redis, token: str):
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
    return user, payload


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _issue_tokens(
    db: AsyncSession,
    user,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> IssuedTokens:
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

    return IssuedTokens(access_token=access_token, refresh_token=raw_refresh)


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
