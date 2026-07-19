import os

_TEST_ENV = {
    "APP_ENV": "test",
    "SECRET_KEY": "unit-test-secret-key-not-for-production",
    "SERVICE_TOKEN": "unit-test-service-token",
    "DATABASE_URL": "postgresql+asyncpg://unit:unit@localhost/unit",
    "GOOGLE_CLIENT_ID": "unit-test-client",
    "GOOGLE_CLIENT_SECRET": "unit-test-client-secret",
    "GOOGLE_REDIRECT_URI": "http://localhost/callback",
    "STORAGE_ENDPOINT": "http://localhost:9000",
    "STORAGE_ACCESS_KEY": "unit-test-access",
    "STORAGE_SECRET_KEY": "unit-test-secret",
    "STORAGE_PUBLIC_URL": "http://localhost:9000/kusshoes",
}

for key, value in _TEST_ENV.items():
    os.environ.setdefault(key, value)
