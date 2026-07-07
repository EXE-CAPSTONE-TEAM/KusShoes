import hashlib

import redis.asyncio as aioredis


def _key(bucket: str, identifier: str) -> str:
    digest = hashlib.sha256(identifier.strip().lower().encode()).hexdigest()
    return f"rate-limit:{bucket}:{digest}"


async def consume(
    redis: aioredis.Redis,
    *,
    bucket: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> int | None:
    """Consume one request and return retry-after seconds when the limit is exceeded."""
    key = _key(bucket, identifier)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_seconds)
    if count <= limit:
        return None
    ttl = await redis.ttl(key)
    return max(ttl, 1)
