from app.services import notification_service
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
def send_payment_confirmation_email(self, user_email: str, plan_tier: str, amount_vnd: int) -> None:
    try:
        notification_service.send_payment_confirmation_email(user_email, plan_tier, amount_vnd)
    except Exception as exc:
        delay = 5 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=delay)
