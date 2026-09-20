import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_redis
from app.schemas.studio import ArtisanDownloadResponse, ArtisanPublicView
from app.services import artisan_service

router = APIRouter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/{token}", response_model=ArtisanPublicView)
async def view_link(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await artisan_service.public_view(db, redis, token, _client_ip(request))


@router.post("/{token}/download", response_model=ArtisanDownloadResponse)
async def download(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await artisan_service.public_download(db, redis, token, _client_ip(request))
