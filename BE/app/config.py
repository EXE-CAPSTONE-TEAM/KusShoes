from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_ENV: str = "development"
    PUBLIC_WEB_URL: str = "http://localhost:5173"
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
    EDITOR_LAUNCH_TICKET_EXPIRE_SECONDS: int = 60
    EDITOR_AUTH_CODE_EXPIRE_SECONDS: int = 60
    EDITOR_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    EDITOR_TOKEN_ISSUER: str = "kusshoes-api"
    EDITOR_TOKEN_AUDIENCE: str = "kusshoes-editor"
    EDITOR_DESKTOP_URL_SCHEME: str = "kusshoes-editor"

    # Authentication abuse protection
    LOGIN_RATE_LIMIT: int = 10
    LOGIN_RATE_WINDOW_SECONDS: int = 900
    REFRESH_RATE_LIMIT: int = 30
    REFRESH_RATE_WINDOW_SECONDS: int = 60
    PASSWORD_RESET_RATE_LIMIT: int = 3
    PASSWORD_RESET_RATE_WINDOW_SECONDS: int = 3600

    # Editor/3D worker integration
    EDITOR_WORKER_URL: str = ""
    EDITOR_WORKER_SERVICE_TOKEN: str = ""
    EDITOR_WORKER_TIMEOUT_SECONDS: int = 300
    MOBILE_COMPUTE_URL: str = ""
    MOBILE_COMPUTE_SERVICE_TOKEN: str = ""
    MOBILE_GRANT_TTL_SECONDS: int = 60
    MOBILE_COMPLETION_TTL_SECONDS: int = 259200
    MOBILE_OUTPUT_UPLOAD_TTL_SECONDS: int = 900

    # Storage (S3-compatible: MinIO local / Cloudflare R2 production)
    STORAGE_ENDPOINT: str
    STORAGE_ACCESS_KEY: str
    STORAGE_SECRET_KEY: str
    STORAGE_BUCKET: str = "kusshoes"
    STORAGE_PUBLIC_URL: str
    STORAGE_REGION: str = "us-east-1"  # MinIO: "us-east-1" | Cloudflare R2: "auto"

    # KIRI Engine (3D scan API — dùng khi port scan pipeline, Phase 2)
    KIRI_API_TOKEN: str = ""
    KIRI_API_BASE_URL: str = "https://api.kiriengine.app/api"

    # Email (SMTP)
    RESEND_API_KEY: str = ""  # deprecated
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    EMAIL_FROM: str = "noreply@kusshoes.vn"

    # Sentry
    SENTRY_DSN: str = ""

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
