import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    get_current_user,
    get_redis,
    verify_mobile_compute_token,
)
from app.schemas.mobile import (
    MobileComputeGrantClaimRequest,
    MobileComputeGrantClaimResponse,
    MobileOutputConfirmRequest,
    MobileOutputConfirmResponse,
    MobileOutputUploadRequest,
    MobileOutputUploadResponse,
    MobileScanBootstrapRequest,
    MobileScanBootstrapResponse,
)
from app.services import mobile_service

router = APIRouter()
internal_router = APIRouter()


@router.post(
    "/scans/bootstrap",
    response_model=MobileScanBootstrapResponse,
    status_code=201,
)
async def bootstrap_scan(
    body: MobileScanBootstrapRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    user=Depends(get_current_user),
) -> MobileScanBootstrapResponse:
    return await mobile_service.bootstrap_scan(db, redis, user, body)


@internal_router.post(
    "/compute-grants/claim",
    response_model=MobileComputeGrantClaimResponse,
)
async def claim_compute_grant(
    body: MobileComputeGrantClaimRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: None = Depends(verify_mobile_compute_token),
) -> MobileComputeGrantClaimResponse:
    return await mobile_service.claim_compute_grant(
        db,
        redis,
        body.compute_grant,
    )


@internal_router.post(
    "/scans/output-upload",
    response_model=MobileOutputUploadResponse,
)
async def create_output_upload(
    body: MobileOutputUploadRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: None = Depends(verify_mobile_compute_token),
) -> MobileOutputUploadResponse:
    return await mobile_service.create_output_upload(
        db,
        redis,
        body.completion_token,
    )


@internal_router.post(
    "/scans/output-confirm",
    response_model=MobileOutputConfirmResponse,
)
async def confirm_output(
    body: MobileOutputConfirmRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: None = Depends(verify_mobile_compute_token),
) -> MobileOutputConfirmResponse:
    return await mobile_service.confirm_output(db, redis, body)
