"""BR-12/13: 2FA setup/enable/disable and login-time verification.

Email-method challenges reuse `otp_store`'s Redis functions under a
namespaced pseudo user-id (e.g. ``2fa-login:<uuid>``) instead of a new store —
same TTL/attempt semantics, zero new Redis primitives.
"""
import secrets

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AuthReauthenticationRequired,
    AuthTwoFactorAlreadyEnabled,
    AuthTwoFactorCodeInvalid,
    AuthTwoFactorNotEnabled,
    AuthTwoFactorRecoveryEmailRequired,
)
from app.infrastructure import otp_store, task_queue, totp
from app.repositories import recovery_code_repo, user_repo
from app.schemas.user import (
    TwoFactorEnableResponse,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
)
from app.utils.password import hash_password, verify_password

RECOVERY_CODE_COUNT = 10


def get_status(user) -> TwoFactorStatusResponse:
    return TwoFactorStatusResponse(
        enabled=user.two_factor_enabled,
        method=user.two_factor_method,
        recovery_email=user.recovery_email,
        recovery_email_verified=user.recovery_email_verified,
    )


async def set_recovery_email(
    db: AsyncSession, redis: aioredis.Redis, user, email: str
) -> dict[str, str]:
    await user_repo.set_recovery_email(db, user, email)
    await db.commit()
    code = otp_store.generate_otp()
    await otp_store.set_otp(redis, f"recovery-email:{user.id}", code)
    task_queue.enqueue_verification_email(email, code)
    return {"message": "Đã gửi mã xác minh tới email khôi phục"}


async def verify_recovery_email(
    db: AsyncSession, redis: aioredis.Redis, user, code: str
) -> dict[str, str]:
    data = await otp_store.get_otp_data(redis, f"recovery-email:{user.id}")
    if not data or data["code"] != code:
        raise AuthTwoFactorCodeInvalid()
    await user_repo.verify_recovery_email(db, user)
    await otp_store.delete_otp(redis, f"recovery-email:{user.id}")
    await db.commit()
    return {"message": "Đã xác minh email khôi phục"}


async def start_setup(db: AsyncSession, redis: aioredis.Redis, user, method: str) -> TwoFactorSetupResponse:
    if user.two_factor_enabled:
        raise AuthTwoFactorAlreadyEnabled()
    if method == "email":
        if not user.recovery_email_verified:
            raise AuthTwoFactorRecoveryEmailRequired()
        code = otp_store.generate_otp()
        await otp_store.set_otp(redis, f"2fa-enable:{user.id}", code)
        task_queue.enqueue_verification_email(user.recovery_email, code)
        return TwoFactorSetupResponse(method="email")

    secret = totp.generate_secret()
    await user_repo.set_totp_pending(db, user, secret)
    await db.commit()
    return TwoFactorSetupResponse(
        method="totp",
        totp_secret=secret,
        provisioning_uri=totp.provisioning_uri(secret=secret, account_email=user.email),
    )


async def enable(
    db: AsyncSession, redis: aioredis.Redis, user, *, method: str, code: str
) -> TwoFactorEnableResponse:
    if user.two_factor_enabled:
        raise AuthTwoFactorAlreadyEnabled()

    if method == "totp":
        if not user.totp_secret or not totp.verify_code(user.totp_secret, code):
            raise AuthTwoFactorCodeInvalid()
    elif method == "email":
        data = await otp_store.get_otp_data(redis, f"2fa-enable:{user.id}")
        if not data or data["code"] != code:
            raise AuthTwoFactorCodeInvalid()
        await otp_store.delete_otp(redis, f"2fa-enable:{user.id}")
    else:
        raise AuthTwoFactorCodeInvalid()

    await user_repo.enable_two_factor(db, user, method)
    codes = _generate_recovery_codes()
    await recovery_code_repo.replace_all(db, user.id, [hash_password(c) for c in codes])
    await db.commit()
    return TwoFactorEnableResponse(message="Đã bật xác thực 2 lớp", recovery_codes=codes)


async def disable(db: AsyncSession, user, *, password: str | None, code: str | None) -> dict[str, str]:
    if not user.two_factor_enabled:
        raise AuthTwoFactorNotEnabled()

    if password:
        if not user.password_hash or not verify_password(password, user.password_hash):
            raise AuthReauthenticationRequired()
    elif code and user.two_factor_method == "totp":
        if not user.totp_secret or not totp.verify_code(user.totp_secret, code):
            raise AuthTwoFactorCodeInvalid()
    else:
        raise AuthReauthenticationRequired()

    await user_repo.disable_two_factor(db, user)
    await recovery_code_repo.delete_all_for_user(db, user.id)
    await db.commit()
    return {"message": "Đã tắt xác thực 2 lớp"}


async def send_login_challenge_code(redis: aioredis.Redis, user) -> None:
    """Email method only — TOTP needs no server-sent code."""
    if user.two_factor_method != "email":
        return
    code = otp_store.generate_otp()
    await otp_store.set_otp(redis, f"2fa-login:{user.id}", code)
    task_queue.enqueue_verification_email(user.recovery_email or user.email, code)


async def verify_login_code(
    db: AsyncSession,
    redis: aioredis.Redis,
    user,
    *,
    code: str | None,
    recovery_code: str | None,
) -> bool:
    if recovery_code:
        return await _consume_recovery_code(db, user.id, recovery_code)
    if not code:
        return False
    if user.two_factor_method == "totp":
        return bool(user.totp_secret) and totp.verify_code(user.totp_secret, code)
    if user.two_factor_method == "email":
        data = await otp_store.get_otp_data(redis, f"2fa-login:{user.id}")
        if not data or data["code"] != code:
            return False
        await otp_store.delete_otp(redis, f"2fa-login:{user.id}")
        return True
    return False


async def _consume_recovery_code(db: AsyncSession, user_id, raw_code: str) -> bool:
    for row in await recovery_code_repo.list_unused(db, user_id):
        if verify_password(raw_code, row.code_hash):
            await recovery_code_repo.mark_used(db, row)
            return True
    return False


def _generate_recovery_codes() -> list[str]:
    return [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(RECOVERY_CODE_COUNT)]
