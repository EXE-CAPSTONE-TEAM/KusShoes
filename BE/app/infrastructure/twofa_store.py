import secrets

import redis.asyncio as aioredis

CHALLENGE_TTL = 300  # 5 minutes


def _challenge_key(token: str) -> str:
    return f"2fa:challenge:{token}"


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
