from collections.abc import AsyncGenerator
import hmac

import redis.asyncio as aioredis
from fastapi import Depends, Header, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, redis_pool
from app.exceptions import AdminForbidden, AuthTokenInvalid
from app.services import auth_service

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
