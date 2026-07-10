from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_ENV: str = "development"
    SECRET_KEY: str
    SERVICE_TOKEN: str

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SSO_TOKEN_EXPIRE_MINUTES: int = 5
    REFRESH_COOKIE_NAME: str = "kusshoes_refresh_token"
    REFRESH_COOKIE_SAMESITE: str = "lax"

    # Authentication abuse protection
    REGISTER_RATE_LIMIT: int = 5
    REGISTER_RATE_WINDOW_SECONDS: int = 60
    LOGIN_RATE_LIMIT: int = 10
    LOGIN_RATE_WINDOW_SECONDS: int = 60
    REFRESH_RATE_LIMIT: int = 30
    REFRESH_RATE_WINDOW_SECONDS: int = 60
    PASSWORD_RESET_RATE_LIMIT: int = 3
    PASSWORD_RESET_RATE_WINDOW_SECONDS: int = 3600

    # Editor/3D worker integration
    EDITOR_WORKER_URL: str = ""
    EDITOR_WORKER_TIMEOUT_SECONDS: int = 300

    # Storage (S3-compatible)
    STORAGE_ENDPOINT: str
    STORAGE_ACCESS_KEY: str
    STORAGE_SECRET_KEY: str
    STORAGE_BUCKET: str = "kusshoes"
    STORAGE_PUBLIC_URL: str

    # Email (SMTP)
    RESEND_API_KEY: str = ""  # deprecated
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    EMAIL_FROM: str = "noreply@kusshoes.vn"

    # Sentry
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # Polar (billing)
    POLAR_ACCESS_TOKEN: str = ""
    POLAR_WEBHOOK_SECRET: str = ""
    POLAR_SERVER: str = "sandbox"  # "sandbox" | "production"
    POLAR_SUCCESS_URL: str = ""

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_testing(self) -> bool:
        return self.APP_ENV == "test"


settings = Settings()
