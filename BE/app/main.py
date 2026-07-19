from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.exceptions import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting KusShoes BE — env={settings.APP_ENV}")

    if settings.SENTRY_DSN:
        sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.APP_ENV)
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
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

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
    mobile,
    project_assets,
    projects,
    subscriptions,
    users,
    webhooks,
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(editor.router, prefix="/api/v1/editor", tags=["Editor"])
app.include_router(mobile.router, prefix="/api/v1/mobile", tags=["Mobile"])
app.include_router(
    mobile.internal_router, prefix="/api/v1/internal/mobile", tags=["Mobile Internal"]
)
app.include_router(admin_auth.router, prefix="/api/v1/admin", tags=["Admin Auth"])
app.include_router(admin_billing.router, prefix="/api/v1/admin", tags=["Admin Billing"])
app.include_router(admin_dashboard.router, prefix="/api/v1/admin", tags=["Admin Dashboard"])
app.include_router(admin_users.router, prefix="/api/v1/admin", tags=["Admin Users"])
app.include_router(admin_plans.router, prefix="/api/v1/admin", tags=["Admin Plans"])
app.include_router(admin_ops.router, prefix="/api/v1/admin", tags=["Admin Ops"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(project_assets.router, prefix="/api/v1/projects", tags=["Assets"])
app.include_router(exports.router, prefix="/api/v1", tags=["Exports"])
app.include_router(subscriptions.router, prefix="/api/v1", tags=["Subscription"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "env": settings.APP_ENV}


@app.get("/health/ready", tags=["Health"])
async def ready():
    import redis.asyncio as aioredis
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

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

    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "ok" if all_ok else "degraded", "checks": checks}
