"""
Integration test fixtures.

Rules:
- Tests hit a real database (kusshoes_test) — no mocking SQLAlchemy sessions.
- Redis: real Redis, each test fixture cleans up its keys via user_id scope.
- Celery tasks are mocked at the task level to avoid actual email sends.
- Each test function gets a fresh DB session; tables are truncated between test modules
  via the `clean_db` autouse fixture.
"""
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.database import get_db
from app.main import app

# ── Test DB ──────────────────────────────────────────────────────────────────
# Uses kusshoes_test — must exist (alembic upgrade head against it)
TEST_DATABASE_URL = "postgresql+asyncpg://kusshoes:kusshoes@db:5432/kusshoes_test"

_test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
_TestSession = async_sessionmaker(_test_engine, expire_on_commit=False, autocommit=False)


@pytest_asyncio.fixture(scope="function")
async def db():
    async with _TestSession() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(autouse=True)
async def clean_db(db):
    """Truncate auth-related tables before each test."""
    from sqlalchemy import text
    await db.execute(
        text(
            "TRUNCATE TABLE refresh_tokens, monthly_usage, subscriptions, users RESTART IDENTITY CASCADE"
        )
    )
    # Billing tests map plans to temporary Polar product IDs. Restore the seeded
    # baseline so repeated and order-independent test runs stay deterministic.
    await db.execute(text("UPDATE plans SET polar_product_id = NULL"))
    await db.commit()
    yield


# ── Redis ─────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def redis():
    import redis.asyncio as aioredis

    from app.config import settings
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    keys = []
    for pattern in ("rate-limit:*", "password-reset:*"):
        keys.extend([key async for key in r.scan_iter(pattern)])
    if keys:
        await r.delete(*keys)
    yield r
    keys = []
    for pattern in ("rate-limit:*", "password-reset:*"):
        keys.extend([key async for key in r.scan_iter(pattern)])
    if keys:
        await r.delete(*keys)
    await r.aclose()


# ── HTTP Client ───────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def client(db, redis):
    async def override_get_db():
        yield db

    async def override_get_redis():
        yield redis

    app.dependency_overrides[get_db] = override_get_db

    from app.dependencies import get_redis as _get_redis
    app.dependency_overrides[_get_redis] = override_get_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


# ── Auth helpers ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def service_headers():
    from app.config import settings
    return {"X-Service-Token": settings.SERVICE_TOKEN}


@pytest_asyncio.fixture(scope="function")
async def authenticated_user(db):
    import bcrypt

    from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo

    user = await user_repo.create_email_user(
        db,
        email="profile@example.com",
        username="profileuser",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Profile",
        last_name="User",
    )
    user.is_verified = True
    plan = await plan_repo.get_free_plan(db)
    await subscription_repo.create_free(db, user_id=user.id, plan_id=plan.id)
    await monthly_usage_repo.create_for_user(db, user_id=user.id)
    await db.commit()
    return user


@pytest_asyncio.fixture(scope="function")
async def auth_headers(authenticated_user):
    from app.utils.jwt import create_access_token

    token = create_access_token(str(authenticated_user.id), role="user")
    return {"Authorization": f"Bearer {token}"}


# ── Celery task mock ──────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_send_otp_email():
    """Always mock email sending — no real SMTP in tests."""
    with patch("app.infrastructure.task_queue.enqueue_verification_email") as mock:
        yield mock


@pytest.fixture(autouse=True)
def mock_send_password_reset_email():
    """Never send recovery email from integration tests."""
    with patch("app.infrastructure.task_queue.enqueue_password_reset_email") as mock:
        yield mock
