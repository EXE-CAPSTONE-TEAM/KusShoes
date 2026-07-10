import httpx

from app.config import settings
from app.types import JsonObject


async def request_bake(payload: JsonObject) -> JsonObject:
    if not settings.EDITOR_WORKER_URL:
        raise ValueError("EDITOR_WORKER_URL chưa được cấu hình")
    async with httpx.AsyncClient(timeout=settings.EDITOR_WORKER_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{settings.EDITOR_WORKER_URL.rstrip('/')}/bake",
            json=payload,
            headers={"X-Service-Token": settings.SERVICE_TOKEN},
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Editor Worker response must be a JSON object")
        return data
