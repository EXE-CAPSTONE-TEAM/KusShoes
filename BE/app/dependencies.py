import hmac
from collections.abc import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, Header, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, redis_pool
from app.exceptions import AdminForbidden, AuthTokenInvalid, ImpersonationRestricted
from app.services import auth_service
from app.utils.jwt import decode_access_token

security = HTTPBearer(auto_error=False)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    yield redis_pool


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: AsyncSession = Depends(get_db),
):
    """Resolve and authorize an active, verified end user."""
    if credentials is None:
        raise AuthTokenInvalid()
    return await auth_service.authenticate_user_access_token(db, credentials.credentials)


async def get_editor_session(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: AsyncSession = Depends(get_db),
):
    """Validate a short-lived editor-only token and its project ownership."""
    if credentials is None:
        raise AuthTokenInvalid()
    return await auth_service.authenticate_editor_session(db, credentials.credentials)


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: AsyncSession = Depends(get_db),
):
    """Resolve and authorize an active admin or staff user."""
    if credentials is None:
        raise AuthTokenInvalid()
    return await auth_service.authenticate_admin_access_token(db, credentials.credentials)


async def get_current_admin_write(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: staff tokens are rejected with 403."""
    if credentials is None:
        raise AuthTokenInvalid()
    admin = await auth_service.authenticate_admin_access_token(db, credentials.credentials)
    if admin.role != "admin":
        raise AdminForbidden()
    return admin


async def verify_service_token(x_service_token: str = Header(...)) -> None:
    if not hmac.compare_digest(x_service_token, settings.SERVICE_TOKEN):
        raise AuthTokenInvalid()


def _impersonator_of(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials is None:
        return None
    try:
        return decode_access_token(credentials.credentials).get("imp")
    except Exception:
        return None  # invalid tokens are rejected by get_current_user itself


async def forbid_impersonation(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> None:
    """BR-80: no payment, password/email change, account deletion or 2FA
    settings while an admin is acting as the customer."""
    if _impersonator_of(credentials):
        raise ImpersonationRestricted()


async def get_impersonator_id(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> str:
    admin_id = _impersonator_of(credentials)
    if not admin_id:
        raise AuthTokenInvalid()
    return admin_id
async def verify_mobile_compute_token(x_service_token: str = Header(...)) -> None:
    expected = settings.MOBILE_COMPUTE_SERVICE_TOKEN
    if not expected or not hmac.compare_digest(x_service_token, expected):
        raise AuthTokenInvalid()
