"""BR-23 scan quota for the scan service (SRS_v2.2.txt:1561).

Service-token only. Deduction order: plan scans of the current cycle first, Credits second.
The caller must send a fresh unique `reference` per scan attempt; re-posting a reference
that already spent a Credit returns that prior result instead of spending another."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import verify_service_token
from app.schemas.credit import ScanBalanceResponse, ScanConsumeRequest, ScanConsumeResponse
from app.services import quota_service

router = APIRouter()


@router.post(
    "/consume",
    response_model=ScanConsumeResponse,
    dependencies=[Depends(verify_service_token)],
)
async def consume_scan(body: ScanConsumeRequest, db: AsyncSession = Depends(get_db)):
    """BR-23: deduct one scan, plan scans first and Credits second (MSG28 when none left)."""
    result = await quota_service.consume_scan_for_user(
        db, body.user_id, reference=body.reference
    )
    return ScanConsumeResponse(
        source=result.source,
        plan_remaining=result.plan_remaining,
        credit_available=result.credit_available,
    )


@router.get(
    "/{user_id}",
    response_model=ScanBalanceResponse,
    dependencies=[Depends(verify_service_token)],
)
async def get_scan_balance(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """BR-23: plan scans left this cycle and spendable Credits for one user."""
    balance, decision = await quota_service.get_scan_status_for_user(db, user_id)
    return ScanBalanceResponse(
        plan_remaining=balance.plan_remaining,
        credit_available=balance.credit_available,
        cycle_start=balance.cycle_start,
        resets_at=balance.resets_at,
        can_scan=decision.can_scan,
        blocked_code=decision.blocked_code,
    )
