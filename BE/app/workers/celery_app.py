from celery import Celery

from app.config import settings

celery_app = Celery(
    "kusshoes",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.tasks.bake_tasks",
        "app.workers.tasks.email_tasks",
        "app.workers.tasks.maintenance_tasks",
        "app.workers.tasks.credit_tasks",
        "app.workers.tasks.api_cost_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.bake_tasks.bake_shoe": {"queue": "normal"},
        "app.workers.tasks.maintenance_tasks.*": {"queue": "low"},
        "app.workers.tasks.credit_tasks.*": {"queue": "low"},
        "app.workers.tasks.api_cost_tasks.*": {"queue": "low"},
    },
    task_queues={
        "high": {"exchange": "high", "routing_key": "high"},
        "normal": {"exchange": "normal", "routing_key": "normal"},
        "low": {"exchange": "low", "routing_key": "low"},
    },
    beat_schedule={
        "enter-grace-period-daily": {
            "task": "app.workers.tasks.maintenance_tasks.enter_grace_period",
            "schedule": 86400.0,  # 24h
        },
        "finalize-grace-expiry-daily": {
            "task": "app.workers.tasks.maintenance_tasks.finalize_grace_expiry",
            "schedule": 86400.0,  # 24h
        },
        "send-renewal-reminders-daily": {
            "task": "app.workers.tasks.maintenance_tasks.send_renewal_reminders",
            "schedule": 86400.0,  # 24h
        },
        "cleanup-stale-uploads-hourly": {
            "task": "app.workers.tasks.maintenance_tasks.cleanup_stale_uploads",
            "schedule": 3600.0,  # 1h
        },
        "cancel-stale-pending-invoices": {
            "task": "app.workers.tasks.maintenance_tasks.cancel_stale_pending_invoices",
            "schedule": 300.0,  # SF-06: every 5 min
        },
        "purge-expired-trash-daily": {
            "task": "app.workers.tasks.maintenance_tasks.purge_expired_trash",
            "schedule": 86400.0,  # BR-47
        },
        "purge-deleted-accounts-daily": {
            "task": "app.workers.tasks.maintenance_tasks.purge_deleted_accounts",
            "schedule": 86400.0,  # BR-06
        },
        "purge-old-login-history-daily": {
            "task": "app.workers.tasks.maintenance_tasks.purge_old_login_history",
            "schedule": 86400.0,  # 24h
        },
        "expire-scan-credits-daily": {
            "task": "app.workers.tasks.credit_tasks.expire_scan_credits",
            "schedule": 86400.0,  # BR-94: 12-month validity (SRS_v2.2.txt:1617)
        },
        "check-api-budget-daily": {
            "task": "app.workers.tasks.api_cost_tasks.check_api_budget",
            "schedule": 86400.0,  # SF-14: 80% warn / 100% suspend (SRS_v2.2.txt:1767)
        },
    },
)
