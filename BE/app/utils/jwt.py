import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: str, role: str = "user") -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_raw_refresh_token() -> str:
    """Trả về raw token (chưa hash). Caller phải hash trước khi lưu DB."""
    return secrets.token_urlsafe(64)


def hash_token(raw_token: str) -> str:
    """SHA-256 hash — dùng để lưu vào DB thay vì raw token."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_sso_token(user_id: str, project_id: str) -> str:
    payload = {
        "sub": user_id,
        "project_id": project_id,
        "type": "sso",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=settings.SSO_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_editor_access_token(user_id: str, project_id: str, scopes: list[str]) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "project_id": project_id,
        "scope": scopes,
        "type": "editor",
        "iss": settings.EDITOR_TOKEN_ISSUER,
        "aud": settings.EDITOR_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.EDITOR_ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.ExpiredSignatureError hoặc jwt.InvalidTokenError nếu invalid."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def decode_sso_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "sso":
        raise jwt.InvalidTokenError("Not an SSO token")
    return payload


IMPERSONATION_MINUTES = 30  # BR-80


def create_impersonation_token(user_id: str, admin_id: str) -> tuple[str, datetime]:
    """Access token for the target user carrying the impersonating admin. No refresh
    token is ever issued for it, so the session cannot outlive 30 minutes."""
    expires_at = datetime.now(UTC) + timedelta(minutes=IMPERSONATION_MINUTES)
    payload = {
        "sub": user_id,
        "role": "user",
        "type": "access",
        "imp": admin_id,
        "iat": datetime.now(UTC),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM), expires_at
def decode_editor_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[ALGORITHM],
        audience=settings.EDITOR_TOKEN_AUDIENCE,
        issuer=settings.EDITOR_TOKEN_ISSUER,
    )
    if payload.get("type") != "editor":
        raise jwt.InvalidTokenError("Not an editor token")
    return payload
