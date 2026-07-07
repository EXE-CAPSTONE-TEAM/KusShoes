from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import billing_service

router = APIRouter()


@router.post("/polar")
async def polar_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    status_code = await billing_service.handle_polar_webhook(
        db, raw_body=raw_body, headers=dict(request.headers)
    )
    return Response(status_code=status_code)
