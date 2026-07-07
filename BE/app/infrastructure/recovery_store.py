import hashlib
import hmac
import json

import redis.asyncio as aioredis

RESET_TTL_SECONDS = 900
MAX_ATTEMPTS = 5


def _email_digest(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def _code_digest(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _key(email: str) -> str:
    return f"password-reset:{_email_digest(email)}"


async def set_code(redis: aioredis.Redis, email: str, code: str) -> None:
    data = {"code_hash": _code_digest(code), "attempts": 0}
    await redis.set(_key(email), json.dumps(data), ex=RESET_TTL_SECONDS)


async def verify_code(redis: aioredis.Redis, email: str, code: str) -> str:
    """Return valid, invalid, locked, or expired without exposing stored codes."""
    key = _key(email)
    raw = await redis.get(key)
    if raw is None:
        return "expired"

    data = json.loads(raw)
    if data["attempts"] >= MAX_ATTEMPTS:
        return "locked"
    if hmac.compare_digest(data["code_hash"], _code_digest(code)):
        return "valid"

    data["attempts"] += 1
    ttl = await redis.ttl(key)
    await redis.set(key, json.dumps(data), ex=max(ttl, 1))
    return "locked" if data["attempts"] >= MAX_ATTEMPTS else "invalid"


async def delete_code(redis: aioredis.Redis, email: str) -> None:
    await redis.delete(_key(email))
