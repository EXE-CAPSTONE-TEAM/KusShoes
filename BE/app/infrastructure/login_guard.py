"""BR-86: 5 failed attempts / 15 minutes, tracked per-account and per-IP."""
import hashlib

import redis.asyncio as aioredis

FAILURE_LIMIT = 5
FAILURE_WINDOW_SECONDS = 900
LOCK_TTL_SECONDS = 900


def _digest(identifier: str) -> str:
    return hashlib.sha256(identifier.strip().lower().encode()).hexdigest()


def _fail_key(scope: str, identifier: str) -> str:
    return f"login-fail:{scope}:{_digest(identifier)}"


def _lock_key(scope: str, identifier: str) -> str:
    return f"login-lock:{scope}:{_digest(identifier)}"


async def get_lock_ttl(redis: aioredis.Redis, scope: str, identifier: str) -> int | None:
    ttl = await redis.ttl(_lock_key(scope, identifier))
    return ttl if ttl > 0 else None


async def record_failure(redis: aioredis.Redis, scope: str, identifier: str) -> bool:
    """Returns True if this failure just triggered a new lockout."""
    key = _fail_key(scope, identifier)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, FAILURE_WINDOW_SECONDS)
    if count >= FAILURE_LIMIT:
        await redis.set(_lock_key(scope, identifier), "1", ex=LOCK_TTL_SECONDS)
        await redis.delete(key)
        return True
    return False


async def reset(redis: aioredis.Redis, scope: str, identifier: str) -> None:
    await redis.delete(_fail_key(scope, identifier))
