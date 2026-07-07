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


def enqueue_payment_confirmation_email(email: str, plan_tier: str, amount_vnd: int) -> None:
    celery_app.send_task(
        "app.workers.tasks.email_tasks.send_payment_confirmation_email",
        args=[email, plan_tier, amount_vnd],
        queue="normal",
    )


def enqueue_bake(job_id: str, priority: str) -> None:
    celery_app.send_task(
        "app.workers.tasks.bake_tasks.bake_shoe",
        args=[job_id],
        queue=priority,
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
