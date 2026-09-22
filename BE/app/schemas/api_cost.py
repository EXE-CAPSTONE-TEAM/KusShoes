"""SF-14 / BR-79 / BR-108 API cost DTOs (SRS_v2.2.txt:1767, :2112)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ApiCallStatus = Literal["success", "failed"]
BudgetState = Literal["unconfigured", "ok", "warning", "suspended"]
IntakeRefusal = Literal["budget_exhausted", "internal_cap"]


class ApiCostRecordRequest(BaseModel):
    user_id: uuid.UUID | None = None
    provider: str = Field(min_length=1, max_length=30)
    operation: str = Field(min_length=1, max_length=50)
    status: ApiCallStatus
    cost_vnd: int = Field(ge=0)
    reference: str | None = Field(default=None, max_length=100)
    occurred_at: datetime | None = None


class ApiCostEntryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    provider: str
    operation: str
    status: ApiCallStatus
    cost_vnd: int
    reference: str | None
    occurred_on: date
    occurred_at: datetime
    created_at: datetime


class ScanIntakeResponse(BaseModel):
    accepted: bool
    reason: IntakeRefusal | None
    message: str | None


class ApiCostDailyRow(BaseModel):
    day: date
    calls: int
    success_calls: int
    failed_calls: int
    cost_vnd: int


class ApiBudgetStatus(BaseModel):
    period_month: date
    budget_vnd: int | None
    spent_vnd: int
    percent: float | None
    state: BudgetState
    warned_at: datetime | None
    suspended_at: datetime | None


class ApiBudgetUpdate(BaseModel):
    month: date
    budget_vnd: int = Field(ge=0)
