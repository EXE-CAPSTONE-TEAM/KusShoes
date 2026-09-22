"""SF-14 / BR-79 API cost tracker and BR-108 daily cost report data.

SRS_v2.2.txt:1767 — "SF-14 ghi chi phí mọi lần gọi API 3D/AI (kể cả thất bại) theo user và theo
ngày. Ngân sách tháng cấu hình được: đạt 80% → cảnh báo Admin; đạt 100% → tạm ngưng nhận Scan Job
mới (giữ nguyên lượt của khách), thiết kế trên phôi vẫn hoạt động. Tài khoản nội bộ có trần riêng
10 lượt quét cho cả kỳ EXE201." (also :631). BR-108 (SRS_v2.2.txt:2112): daily API cost as CSV.

- Every call is one api_cost_entries row, failed calls included; `occurred_on` is the GMT+7
  business day (period_service.to_business_date, the same day boundary every report uses).
- The monthly budget is Admin-configured in api_budget_periods (no row = "unconfigured": no
  warning, no suspension). Thresholds come from settings.API_BUDGET_WARN_PERCENT /
  API_BUDGET_SUSPEND_PERCENT; the Admin alert is sent once per period (warned_at).
- Suspension only refuses NEW scan jobs through `assert_scan_intake_available`, which the scan
  entry point (mobile_service.bootstrap_scan) calls. It never touches monthly_usage or
  scan_credits (the customer keeps their scans) and no project/design/bake path is gated.
"""

import calendar
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import AdminUserNotFound, ScanIntakeSuspended
from app.infrastructure import email_sender, task_queue
from app.repositories import api_cost_repo, user_repo
from app.schemas.api_cost import (
    ApiBudgetStatus,
    ApiBudgetUpdate,
    ApiCostDailyRow,
    ApiCostEntryResponse,
    ApiCostRecordRequest,
    ScanIntakeResponse,
)
from app.services.audit import record_audit
from app.services.period_service import to_business_date

SCAN_OPERATION = "scan_3d"  # operation name the scan pipeline records for one 3D scan
_SUCCESS_STATUS = "success"
_PERCENT_SCALE = 100
_STATE_UNCONFIGURED = "unconfigured"
_STATE_OK = "ok"
_STATE_WARNING = "warning"
_STATE_SUSPENDED = "suspended"
_REFUSAL_BUDGET = "budget_exhausted"
_REFUSAL_INTERNAL_CAP = "internal_cap"


# --- Pure helpers ----------------------------------------------------------------------


def _today() -> date:
    return to_business_date(datetime.now(UTC))


def month_start(day: date) -> date:
    return day.replace(day=1)


def _month_end(first_day: date) -> date:
    return first_day.replace(day=calendar.monthrange(first_day.year, first_day.month)[1])


def _reached(spent_vnd: int, budget_vnd: int, percent: int) -> bool:
    # Integer comparison: spent / budget >= percent / 100, without float rounding.
    return spent_vnd * _PERCENT_SCALE >= budget_vnd * percent


def budget_state(spent_vnd: int, budget_vnd: int | None) -> str:
    if budget_vnd is None:
        return _STATE_UNCONFIGURED
    if _reached(spent_vnd, budget_vnd, settings.API_BUDGET_SUSPEND_PERCENT):
        return _STATE_SUSPENDED
    if _reached(spent_vnd, budget_vnd, settings.API_BUDGET_WARN_PERCENT):
        return _STATE_WARNING
    return _STATE_OK


def _as_aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


# --- Recording (internal, service token) -----------------------------------------------


async def record_call(db: AsyncSession, body: ApiCostRecordRequest) -> ApiCostEntryResponse:
    if body.user_id is not None and await user_repo.get_by_id_any(db, body.user_id) is None:
        raise AdminUserNotFound()
    now = datetime.now(UTC)
    occurred_at = _as_aware(body.occurred_at) if body.occurred_at else now
    entry = await api_cost_repo.create_entry(
        db,
        user_id=body.user_id,
        provider=body.provider,
        operation=body.operation,
        status=body.status,
        cost_vnd=body.cost_vnd,
        reference=body.reference,
        occurred_on=to_business_date(occurred_at),
        occurred_at=occurred_at,
        created_at=now,
    )
    status, alert_due = await _apply_thresholds(db, month_start(entry.occurred_on), now=now)
    await db.commit()
    if alert_due:
        _enqueue_alert(status)
    return ApiCostEntryResponse.model_validate(entry, from_attributes=True)


# --- Budget ----------------------------------------------------------------------------


async def _spent(db: AsyncSession, first_day: date) -> int:
    return await api_cost_repo.total_cost(db, start=first_day, end=_month_end(first_day))


def _to_status(period_month: date, period, spent_vnd: int) -> ApiBudgetStatus:
    budget_vnd = period.budget_vnd if period else None
    return ApiBudgetStatus(
        period_month=period_month,
        budget_vnd=budget_vnd,
        spent_vnd=spent_vnd,
        percent=spent_vnd * _PERCENT_SCALE / budget_vnd if budget_vnd else None,
        state=budget_state(spent_vnd, budget_vnd),
        warned_at=period.warned_at if period else None,
        suspended_at=period.suspended_at if period else None,
    )


async def _apply_thresholds(
    db: AsyncSession, period_month: date, *, now: datetime
) -> tuple[ApiBudgetStatus, bool]:
    """Stamps warned_at (once per period) and suspended_at for the month. Returns the status and
    whether the Admin alert is due. The row is locked so concurrent calls alert only once."""
    period = await api_cost_repo.get_period(db, period_month, for_update=True)
    spent = await _spent(db, period_month)
    state = budget_state(spent, period.budget_vnd if period else None)
    alert_due = False
    if period is not None:
        if state in (_STATE_WARNING, _STATE_SUSPENDED) and period.warned_at is None:
            period.warned_at = now
            alert_due = True
        if state == _STATE_SUSPENDED:
            if period.suspended_at is None:
                period.suspended_at = now
        else:
            # The Admin raised the budget above spend: intake is open again.
            period.suspended_at = None
        await db.flush()
    return _to_status(period_month, period, spent), alert_due


async def get_budget(db: AsyncSession, month: date | None) -> ApiBudgetStatus:
    period_month = month_start(month or _today())
    period = await api_cost_repo.get_period(db, period_month)
    return _to_status(period_month, period, await _spent(db, period_month))


async def set_budget(db: AsyncSession, admin, body: ApiBudgetUpdate) -> ApiBudgetStatus:
    period_month = month_start(body.month)
    existing = await api_cost_repo.get_period(db, period_month)
    previous = existing.budget_vnd if existing else None
    now = datetime.now(UTC)
    await api_cost_repo.upsert_period(
        db, period_month=period_month, budget_vnd=body.budget_vnd, now=now
    )
    status, alert_due = await _apply_thresholds(db, period_month, now=now)
    await record_audit(
        db, admin, "api_budget.update", target_type="api_budget_period",
        target_id=period_month.isoformat(),
        payload={"budget_vnd": body.budget_vnd, "previous_budget_vnd": previous},
    )
    await db.commit()
    if alert_due:
        _enqueue_alert(status)
    return status


async def check_current_budget(db: AsyncSession) -> dict:
    """Daily beat job (celery beat "check-api-budget-daily"): re-evaluates the current month so
    the warn alert and the suspend stamp are applied even when no single recorded call crossed
    the threshold (e.g. entries recorded with a backdated occurred_at)."""
    status, alert_due = await _apply_thresholds(db, month_start(_today()), now=datetime.now(UTC))
    await db.commit()
    if alert_due:
        _enqueue_alert(status)
    return {
        "period_month": status.period_month.isoformat(),
        "state": status.state,
        "alerted": alert_due,
    }


def _alert_recipient() -> str:
    return settings.API_COST_ADMIN_ALERT_EMAIL or settings.EMAIL_FROM


def _enqueue_alert(status: ApiBudgetStatus) -> None:
    task_queue.enqueue_api_budget_alert_email(
        _alert_recipient(),
        status.period_month.isoformat(),
        status.spent_vnd,
        status.budget_vnd,
        settings.API_BUDGET_WARN_PERCENT,
    )


def send_budget_alert_email(
    email: str, period_month: str, spent_vnd: int, budget_vnd: int, warn_percent: int
) -> None:
    """Called by the email worker task; the actual SMTP send lives in infrastructure."""
    email_sender.send_api_budget_alert_email(
        email, period_month, spent_vnd, budget_vnd, warn_percent
    )


# --- Scan intake gate ------------------------------------------------------------------


async def _intake_refusal(db: AsyncSession, user) -> str | None:
    period_month = month_start(_today())
    period = await api_cost_repo.get_period(db, period_month)
    if period is not None and (
        budget_state(await _spent(db, period_month), period.budget_vnd) == _STATE_SUSPENDED
    ):
        return _REFUSAL_BUDGET
    if user is not None and user.is_internal:
        # Counted over all time: the cap is for the whole EXE201 period, not per month.
        scans = await api_cost_repo.count_user_operation(db, user.id, SCAN_OPERATION)
        if scans >= settings.INTERNAL_ACCOUNT_SCAN_CAP:
            return _REFUSAL_INTERNAL_CAP
    return None


async def assert_scan_intake_available(db: AsyncSession, user) -> None:
    """Raises ScanIntakeSuspended (MSG43) when the month's budget has reached
    API_BUDGET_SUSPEND_PERCENT, or when an internal account has used INTERNAL_ACCOUNT_SCAN_CAP
    scans. Read-only: it never deducts, reserves or stamps anything."""
    reason = await _intake_refusal(db, user)
    if reason is not None:
        raise ScanIntakeSuspended(reason)


async def scan_intake(db: AsyncSession, user_id: uuid.UUID | None) -> ScanIntakeResponse:
    user = None
    if user_id is not None:
        user = await user_repo.get_by_id_any(db, user_id)
        if user is None:
            raise AdminUserNotFound()
    try:
        await assert_scan_intake_available(db, user)
    except ScanIntakeSuspended as refused:
        return ScanIntakeResponse(
            accepted=False, reason=refused.extra["reason"], message=refused.message
        )
    return ScanIntakeResponse(accepted=True, reason=None, message=None)


# --- Daily rollup (admin view + BR-108 report) -----------------------------------------


async def daily_rows(db: AsyncSession, start: date, end: date) -> list[ApiCostDailyRow]:
    """One row per GMT+7 day in start..end, ascending, zero-filled for days without calls."""
    totals = {
        day: (calls, ok, cost)
        for day, calls, ok, cost in await api_cost_repo.daily_totals(
            db, start=start, end=end, success_status=_SUCCESS_STATUS
        )
    }
    rows = []
    day = start
    while day <= end:
        calls, ok, cost = totals.get(day, (0, 0, 0))
        rows.append(
            ApiCostDailyRow(
                day=day, calls=calls, success_calls=ok, failed_calls=calls - ok, cost_vnd=cost
            )
        )
        day += timedelta(days=1)
    return rows


async def list_daily(
    db: AsyncSession, *, date_from: date | None, date_to: date | None
) -> list[ApiCostDailyRow]:
    end = date_to or _today()
    return await daily_rows(db, date_from or month_start(end), end)
