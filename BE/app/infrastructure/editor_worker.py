import httpx

from app.config import settings


async def request_bake(payload: dict) -> dict:
    if not settings.EDITOR_WORKER_URL:
        raise ValueError("EDITOR_WORKER_URL chưa được cấu hình")
    async with httpx.AsyncClient(timeout=settings.EDITOR_WORKER_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{settings.EDITOR_WORKER_URL.rstrip('/')}/bake",
            json=payload,
            headers={"X-Service-Token": settings.SERVICE_TOKEN},
        )
        response.raise_for_status()
        return response.json()

