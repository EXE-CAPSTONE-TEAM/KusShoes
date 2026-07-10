from contextlib import asynccontextmanager
from contextvars import ContextVar
import os
import sys
import uuid
from time import monotonic

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from loguru import logger
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import settings
from app.exceptions import register_exception_handlers
from app.metrics import observe_request, render_prometheus

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def _add_request_id_to_log(record):
    record["extra"]["request_id"] = request_id_var.get()


logger.remove()
logger.add(
    sys.stderr,
    format=(
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | "
        "request_id={extra[request_id]} | {name}:{function}:{line} - {message}"
    ),
)
logger.configure(patcher=_add_request_id_to_log)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting KusShoes BE — env={settings.APP_ENV}")

    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[FastApiIntegration()],
            environment=settings.APP_ENV,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        )
        logger.info("Sentry initialized")

    yield

    logger.info("Shutting down KusShoes BE")


app = FastAPI(
    title="KusShoes Platform API",
    version="0.1.0",
    description="Business Layer Backend for kusshoes.vn",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kusshoes.vn",
        "https://app.kusshoes.vn",
        "http://localhost:3000",  # local FE dev
        "http://localhost:5173",  # Vite local FE dev
        "http://127.0.0.1:5173",
        "http://localhost:1420",  # Tauri dev server
        "http://127.0.0.1:1420",
        "http://tauri.localhost",  # Tauri desktop webview
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


@app.middleware("http")
async def add_request_id(request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    started_at = monotonic()
    token = request_id_var.set(request_id)
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        observe_request(request.method, path, status_code, started_at)
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = request_id
    return response

# --- Routers ---
from app.routers import (  # noqa: E402
    admin_auth,
    admin_billing,
    admin_dashboard,
    admin_ops,
    admin_plans,
    admin_users,
    auth,
    editor,
    exports,
    project_assets,
    projects,
    subscriptions,
    users,
    webhooks,
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(admin_auth.router, prefix="/api/v1/admin", tags=["Admin Auth"])
app.include_router(admin_billing.router, prefix="/api/v1/admin", tags=["Admin Billing"])
app.include_router(admin_dashboard.router, prefix="/api/v1/admin", tags=["Admin Dashboard"])
app.include_router(admin_users.router, prefix="/api/v1/admin", tags=["Admin Users"])
app.include_router(admin_plans.router, prefix="/api/v1/admin", tags=["Admin Plans"])
app.include_router(admin_ops.router, prefix="/api/v1/admin", tags=["Admin Ops"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(project_assets.router, prefix="/api/v1/projects", tags=["Assets"])
app.include_router(editor.router, prefix="/api/v1/editor", tags=["Editor"])
app.include_router(exports.router, prefix="/api/v1", tags=["Exports"])
app.include_router(subscriptions.router, prefix="/api/v1", tags=["Subscription"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "env": settings.APP_ENV}


@app.get("/health/ready", tags=["Health"])
async def ready():
    import asyncio
    import redis.asyncio as aioredis
    from sqlalchemy import text

    from app.database import AsyncSessionLocal
    from app.infrastructure import storage

    checks: dict = {}

    # DB check
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e}"

    # Redis check
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # S3/MinIO check
    try:
        await asyncio.to_thread(storage.health_check)
        checks["storage"] = "ok"
    except Exception as e:
        checks["storage"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
        "version": os.getenv("APP_VERSION", "unknown"),
    }


@app.get("/metrics", tags=["Monitoring"])
async def metrics():
    return PlainTextResponse(render_prometheus(), media_type="text/plain; version=0.0.4")
