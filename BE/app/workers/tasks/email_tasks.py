from app.services import api_cost_service, notification_service
from app.workers.celery_app import celery_app


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_otp_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_otp_email(self, user_email: str, otp_code: str) -> None:
    try:
        notification_service.send_verification_email(user_email, otp_code)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_password_reset_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_password_reset_email(self, user_email: str, otp_code: str) -> None:
    try:
        notification_service.send_password_reset_email(user_email, otp_code)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_payment_confirmation_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_payment_confirmation_email(
    self, user_email: str, plan_tier: str, amount_vnd: int, receipt_number: str | None = None
) -> None:
    try:
        notification_service.send_payment_confirmation_email(
            user_email, plan_tier, amount_vnd, receipt_number
        )
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_renewal_reminder_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_renewal_reminder_email(self, user_email: str, days_before: int) -> None:
    try:
        notification_service.send_renewal_reminder_email(user_email, days_before)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_grace_period_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_grace_period_email(self, user_email: str) -> None:
    try:
        notification_service.send_grace_period_email(user_email)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_new_device_login_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_new_device_login_email(
    self, user_email: str, ip_address: str | None, user_agent: str | None
) -> None:
    try:
        notification_service.send_new_device_login_email(
            user_email, ip_address=ip_address, user_agent=user_agent
        )
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_account_locked_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_account_locked_email(self, user_email: str) -> None:
    try:
        notification_service.send_account_locked_email(user_email)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_account_restore_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_account_restore_email(self, user_email: str, otp_code: str) -> None:
    try:
        notification_service.send_account_restore_email(user_email, otp_code)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_impersonation_notice_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_impersonation_notice_email(self, user_email: str, reason: str) -> None:
    try:
        notification_service.send_impersonation_notice_email(user_email, reason)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)


@celery_app.task(
    name="app.workers.tasks.email_tasks.send_api_budget_alert_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def send_api_budget_alert_email(
    self, user_email: str, period_month: str, spent_vnd: int, budget_vnd: int, warn_percent: int
) -> None:
    """SF-14 (SRS_v2.2.txt:1767): "đạt 80% → cảnh báo Admin"."""
    try:
        api_cost_service.send_budget_alert_email(
            user_email, period_month, spent_vnd, budget_vnd, warn_percent
        )
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)
