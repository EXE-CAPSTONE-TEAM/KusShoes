from app.workers.celery_app import celery_app


def enqueue_verification_email(email: str, otp_code: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_otp_email",
        args=[email, otp_code],
        queue="normal",
    )


def enqueue_password_reset_email(email: str, otp_code: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_password_reset_email",
        args=[email, otp_code],
        queue="normal",
    )


def enqueue_payment_confirmation_email(
    email: str, plan_tier: str, amount_vnd: int, receipt_number: str | None = None
) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_payment_confirmation_email",
        args=[email, plan_tier, amount_vnd, receipt_number],
        queue="normal",
    )


def enqueue_renewal_reminder_email(email: str, days_before: int) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_renewal_reminder_email",
        args=[email, days_before],
        queue="normal",
    )


def enqueue_grace_period_email(email: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_grace_period_email",
        args=[email],
        queue="normal",
    )


def enqueue_new_device_login_email(
    email: str, *, ip_address: str | None, user_agent: str | None
) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_new_device_login_email",
        args=[email, ip_address, user_agent],
        queue="normal",
    )


def enqueue_account_locked_email(email: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_account_locked_email",
        args=[email],
        queue="normal",
    )


def enqueue_storage_delete(file_path: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.maintenance_tasks.delete_storage_file",
        args=[file_path],
        queue="low",
    )


def enqueue_project_cleanup(project_id: str, *, countdown: int) -> None:
    celery_app.send_task(
        "app.workers.tasks.maintenance_tasks.cleanup_project_files",
        args=[project_id],
        queue="low",
        countdown=countdown,
    )


def enqueue_user_cleanup(user_id: str, *, countdown: int) -> None:
    celery_app.send_task(
        "app.workers.tasks.maintenance_tasks.cleanup_user_files",
        args=[user_id],
        queue="low",
        countdown=countdown,
    )


def enqueue_account_restore_email(email: str, otp_code: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_account_restore_email",
        args=[email, otp_code],
        queue="normal",
    )


def enqueue_impersonation_notice_email(email: str, reason: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_impersonation_notice_email",
        args=[email, reason],
        queue="normal",
    )


def enqueue_api_budget_alert_email(
    email: str, period_month: str, spent_vnd: int, budget_vnd: int, warn_percent: int
) -> None:
    """SF-14 (SRS_v2.2.txt:1767): the month's API spend reached the warn threshold."""
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_api_budget_alert_email",
        args=[email, period_month, spent_vnd, budget_vnd, warn_percent],
        queue="normal",
    )
