"""Celery tasks run each coroutine in a fresh event loop (one asyncio.run per task call), while
app.database keeps one pooled engine per process. A pooled asyncpg connection opened in one loop
must not be reused in the next, or the task fails with "attached to a different loop"."""
from app.workers.tasks import credit_tasks


def test_task_runs_twice_in_one_worker_process():
    # Called synchronously, back to back, exactly as a prefork worker process runs them.
    first = credit_tasks.expire_scan_credits()
    second = credit_tasks.expire_scan_credits()

    assert first["status"] == "completed"
    assert second["status"] == "completed"
