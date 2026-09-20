import uuid
from datetime import date

from pydantic import BaseModel


class PeriodValue(BaseModel):
    current: int
    previous: int


class ChurnMetric(BaseModel):
    due: int
    churned: int
    rate: float | None  # None when nobody was due in the period


class RateMetric(BaseModel):
    numerator: int
    denominator: int
    rate: float | None


class RepeatMetric(BaseModel):
    paying_customers: int
    repeat_customers: int
    not_yet_due: int
    rate: float | None  # repeat / (paying - not_yet_due), BR-105
    raw_rate: float | None  # repeat / paying


class RetentionMetric(BaseModel):
    month: str
    nrr: float | None
    grr: float | None


class MrrMovement(BaseModel):
    month: str
    new: int
    expansion: int
    reactivation: int
    contraction: int
    churn: int
    net_new: int


class PlanRevenue(BaseModel):
    plan_tier: str
    revenue_vnd: int
    share: float


class TopCustomer(BaseModel):
    user_id: uuid.UUID
    email: str | None
    net_paid_vnd: int
    orders: int


class FailedPayments(BaseModel):
    count_30d: int
    amount_30d_vnd: int


class RevenuePoint(BaseModel):
    month: str
    revenue_vnd: int


class AnalyticsResponse(BaseModel):
    date_from: date
    date_to: date
    mrr_vnd: int
    arr_vnd: int
    arpu_vnd: int
    paying_customers: int
    revenue_vnd: PeriodValue  # recognised: paid − refunds, by payment date
    refunds_vnd: PeriodValue
    new_paying_customers: PeriodValue
    churn: ChurnMetric
    retention: RetentionMetric
    free_to_paid: RateMetric
    repeat: RepeatMetric
    failed_payments: FailedPayments
    revenue_by_plan: list[PlanRevenue]
    revenue_series: list[RevenuePoint]
    mrr_movement: MrrMovement
    top_customers: list[TopCustomer]
