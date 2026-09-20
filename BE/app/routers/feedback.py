from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.feedback import FeedbackCreate, FeedbackEligibility, FeedbackResponse
from app.services import feedback_service

router = APIRouter()


@router.get("/feedback/eligibility", response_model=FeedbackEligibility)
async def feedback_eligibility(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await feedback_service.get_eligibility(db, user)


@router.post("/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    body: FeedbackCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await feedback_service.submit(db, user, body)


@router.get("/feedback/mine", response_model=list[FeedbackResponse])
async def my_feedback(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    return await feedback_service.list_mine(db, user)
