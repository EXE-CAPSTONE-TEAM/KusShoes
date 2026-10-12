"""Admin finance dashboard payloads (GET /admin/dashboard/finance)."""

from datetime import date, datetime

from pydantic import BaseModel


class FinanceTotals(BaseModel):
    revenue_vnd: int
    api_cost_vnd: int
    maintenance_cost_vnd: int
    total_cost_vnd: int
    profit_vnd: int  # revenue - api cost - maintenance; negative when running at a loss
    contribution_margin_vnd: int  # revenue - api cost
    contribution_margin_rate: float | None  # null when revenue is 0
    profit_margin_rate: float | None  # null when revenue is 0


class FinancePoint(BaseModel):
    period_start: date
    revenue_vnd: int
    api_cost_vnd: int
    maintenance_cost_vnd: int
    profit_vnd: int


class FinanceMaintenance(BaseModel):
    configured: bool
    monthly_vnd: int | None


class FinanceOverviewResponse(BaseModel):
    as_of: datetime
    since: date | None
    totals: FinanceTotals
    current_month: FinanceTotals
    maintenance: FinanceMaintenance
    series_1m: list[FinancePoint]
    series_6m: list[FinancePoint]
