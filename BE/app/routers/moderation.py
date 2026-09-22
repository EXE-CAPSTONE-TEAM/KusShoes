"""BR-77 / UC-24: public copyright-complaint intake and the customer's own moderation status
(SRS_v2.2.txt:2042, :194)."""

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_redis
from app.schemas.moderation import ContentReportAccepted, ContentReportCreate, MyModerationStatus
from app.services import moderation_service

public_router = APIRouter()
router = APIRouter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@public_router.post("/content-reports", response_model=ContentReportAccepted, status_code=202)
async def submit_content_report(
    body: ContentReportCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    return await moderation_service.submit_report(db, redis, body, _client_ip(request))


@router.get("/me", response_model=MyModerationStatus)
async def my_moderation_status(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await moderation_service.my_status(db, user)
