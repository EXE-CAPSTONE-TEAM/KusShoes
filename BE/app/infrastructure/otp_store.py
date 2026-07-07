import json
import secrets
from datetime import UTC, datetime

import redis.asyncio as aioredis

OTP_TTL = 900
LOCK_TTL = 3600


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_key(user_id: str) -> str:
    return f"otp:verify:{user_id}"


def lock_key(user_id: str) -> str:
    return f"otp:lock:{user_id}"


async def set_otp(redis: aioredis.Redis, user_id: str, code: str) -> None:
    data = {"code": code, "attempts": 0, "resend_count": 0, "resend_at": None}
    await redis.set(otp_key(user_id), json.dumps(data), ex=OTP_TTL)


async def get_otp_data(redis: aioredis.Redis, user_id: str) -> dict | None:
    raw = await redis.get(otp_key(user_id))
    return None if raw is None else json.loads(raw)


async def increment_attempts(redis: aioredis.Redis, user_id: str) -> int:
    key = otp_key(user_id)
    raw = await redis.get(key)
    if raw is None:
        return 5
    data = json.loads(raw)
    data["attempts"] += 1
    ttl = await redis.ttl(key)
    await redis.set(key, json.dumps(data), ex=max(ttl, 1))
    return data["attempts"]


async def set_lock(redis: aioredis.Redis, user_id: str) -> None:
    await redis.set(lock_key(user_id), "1", ex=LOCK_TTL)


async def delete_otp(redis: aioredis.Redis, user_id: str) -> None:
    await redis.delete(otp_key(user_id))


async def get_lock_ttl(redis: aioredis.Redis, user_id: str) -> int | None:
    ttl = await redis.ttl(lock_key(user_id))
    return ttl if ttl > 0 else None


async def update_resend(redis: aioredis.Redis, user_id: str, new_code: str) -> None:
    key = otp_key(user_id)
    raw = await redis.get(key)
    if raw is None:
        return
    data = json.loads(raw)
    data["code"] = new_code
    data["attempts"] = 0
    data["resend_count"] += 1
    data["resend_at"] = datetime.now(UTC).isoformat()
    await redis.set(key, json.dumps(data), ex=OTP_TTL)

