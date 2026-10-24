import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MarketingGroup = Literal["product", "price", "place", "promotion"]
FeedbackStatus = Literal["new", "reviewed", "planned", "done", "wont_do"]


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    message: str = Field(min_length=3, max_length=2000)
    marketing_group: MarketingGroup = "product"


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    rating: int
    marketing_group: str
    message: str
    status: str
    changed_what: str | None
    created_at: datetime


class FeedbackEligibility(BaseModel):
    can_submit: bool
    next_allowed_at: datetime | None


class AdminFeedbackResponse(FeedbackResponse):
    user_id: uuid.UUID
    user_email: str | None
    is_internal: bool
    reviewed_at: datetime | None


class FeedbackUpdate(BaseModel):
    status: FeedbackStatus | None = None
    changed_what: str | None = Field(default=None, max_length=2000)


class FeedbackSummary(BaseModel):
    count: int
    average_rating: float
    by_status: dict[str, int]
    by_group: dict[str, int]
