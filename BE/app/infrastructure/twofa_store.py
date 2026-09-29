import secrets

import redis.asyncio as aioredis

CHALLENGE_TTL = 300  # 5 minutes
MAX_VERIFY_ATTEMPTS = 5  # brute-force guard: burn the challenge after this many wrong codes


def _challenge_key(token: str) -> str:
    return f"2fa:challenge:{token}"


def _attempts_key(token: str) -> str:
    return f"2fa:attempts:{token}"


async def record_failed_attempt(redis: aioredis.Redis, token: str) -> int:
    """Count a wrong code against this challenge; returns the running total."""
    key = _attempts_key(token)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, CHALLENGE_TTL)
    return count


async def clear_attempts(redis: aioredis.Redis, token: str) -> None:
    await redis.delete(_attempts_key(token))


async def create_challenge(redis: aioredis.Redis, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await redis.set(_challenge_key(token), user_id, ex=CHALLENGE_TTL)
    return token


async def peek_challenge(redis: aioredis.Redis, token: str) -> str | None:
    """Read-only — a wrong code shouldn't burn the challenge, so the user can
    retry until it expires. Call `delete_challenge` only once verified."""
    return await redis.get(_challenge_key(token))


async def delete_challenge(redis: aioredis.Redis, token: str) -> None:
    await redis.delete(_challenge_key(token))
