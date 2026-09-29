import asyncio
from collections.abc import Coroutine
from typing import Any

from app.database import engine


def run_async[T](coro: Coroutine[Any, Any, T]) -> T:
    """Run a task's coroutine from a sync Celery task.

    Every call gets its own event loop, but the engine's pool lives for the whole worker
    process. Disposing the pool before the loop closes keeps a connection opened in this loop
    from being handed to the next task's loop ("attached to a different loop").
    """

    async def _run() -> T:
        try:
            return await coro
        finally:
            await engine.dispose()

    return asyncio.run(_run())
