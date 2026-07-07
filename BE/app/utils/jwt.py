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


def decode_access_token(token: str) -> dict:
    """Raises jwt.ExpiredSignatureError hoặc jwt.InvalidTokenError nếu invalid."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def decode_sso_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "sso":
        raise jwt.InvalidTokenError("Not an SSO token")
    return payload
