import json

import httpx

from app.config import settings

MAX_WORKER_RESPONSE_BYTES = 1024 * 1024
TRANSIENT_CLIENT_STATUSES = {408, 425, 429}


async def request_bake(payload: dict) -> dict:
    if not settings.EDITOR_WORKER_URL:
        raise ValueError("EDITOR_WORKER_URL chưa được cấu hình")
    if not settings.EDITOR_WORKER_SERVICE_TOKEN:
        raise ValueError("EDITOR_WORKER_SERVICE_TOKEN chưa được cấu hình")

    timeout_seconds = max(1, settings.EDITOR_WORKER_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            timeout_seconds,
            connect=min(timeout_seconds, 30),
        ),
        follow_redirects=False,
        trust_env=False,
    ) as client:
        async with client.stream(
            "POST",
            f"{settings.EDITOR_WORKER_URL.rstrip('/')}/bake",
            json=payload,
            headers={"X-Service-Token": settings.EDITOR_WORKER_SERVICE_TOKEN},
        ) as response:
            if 300 <= response.status_code < 400 or (
                400 <= response.status_code < 500
                and response.status_code not in TRANSIENT_CLIENT_STATUSES
            ):
                raise ValueError(f"Editor Worker từ chối bake request ({response.status_code})")
            response.raise_for_status()

            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_WORKER_RESPONSE_BYTES:
                    raise ValueError("Editor Worker trả về response quá lớn")

    try:
        value = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Editor Worker trả về JSON không hợp lệ") from exc
    if not isinstance(value, dict):
        raise ValueError("Editor Worker trả về response không hợp lệ")
    return value
