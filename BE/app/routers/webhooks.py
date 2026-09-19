from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import billing_service

router = APIRouter()


@router.post("/payos")
async def payos_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    status_code = await billing_service.handle_payos_webhook(db, raw_body=raw_body)
    return Response(status_code=status_code)


@router.post("/momo")
async def momo_ipn(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    status_code = await billing_service.handle_momo_ipn(db, payload=payload)
    return Response(status_code=status_code)
