import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UpdateProfileRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    username: str | None = None
    avatar_path: str | None = None
    phone_number: str | None = Field(default=None, max_length=20)
    bio: str | None = Field(default=None, max_length=1000)
    language: Literal["vi", "en"] | None = None
    preferred_styles: list[str] | None = Field(default=None, max_length=20)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{2,29}", value):
            raise ValueError("Tên đăng nhập phải có 3–30 ký tự và không bắt đầu bằng số")
        return value

    @field_validator("preferred_styles")
    @classmethod
    def validate_styles(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized = [style.strip().lower() for style in value if style.strip()]
        if any(len(style) > 50 for style in normalized):
            raise ValueError("Mỗi phong cách tối đa 50 ký tự")
        return list(dict.fromkeys(normalized))


class AvatarUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: Literal["image/jpeg", "image/png", "image/webp"]


class AvatarUploadResponse(BaseModel):
    upload_url: str
    file_path: str
    expires_in: int = 900


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8 or not any(c.isupper() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Mật khẩu mới cần tối thiểu 8 ký tự, 1 chữ hoa và 1 chữ số")
        return value

    @model_validator(mode="after")
    def passwords_match(self) -> "ChangePasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Mật khẩu xác nhận không khớp")
        return self


class DeleteAccountRequest(BaseModel):
    password: str | None = None
    google_id_token: str | None = None


class UserDetailResponse(BaseModel):
    id: uuid.UUID
    account_code: str
    email: str
    first_name: str
    last_name: str
    username: str
    avatar_path: str | None
    phone_number: str | None
    bio: str | None
    language: str
    preferred_styles: list[str]
    status: str
    member_since: datetime
    total_designs: int


class UsageResponse(BaseModel):
    tier: str
    max_projects: int | None
    max_exports_per_month: int | None
    projects_count: int
    exports_count: int
    ai_credits_used: int
    ai_credits_limit: int | None = None


class MessageResponse(BaseModel):
    message: str


# --- BR-15 Privacy ---


class PrivacySettingsResponse(BaseModel):
    is_profile_public: bool
    show_designs_publicly: bool
    is_searchable: bool
    allow_analytics: bool
    allow_ads_personalization: bool


class UpdatePrivacySettingsRequest(BaseModel):
    is_profile_public: bool | None = None
    show_designs_publicly: bool | None = None
    is_searchable: bool | None = None
    allow_analytics: bool | None = None
    allow_ads_personalization: bool | None = None


# --- BR-12/13 Two-factor authentication ---


class TwoFactorStatusResponse(BaseModel):
    enabled: bool
    method: str | None
    recovery_email: str | None
    recovery_email_verified: bool


class SetRecoveryEmailRequest(BaseModel):
    recovery_email: EmailStr


class VerifyRecoveryEmailRequest(BaseModel):
    code: str


class TwoFactorSetupRequest(BaseModel):
    method: Literal["totp", "email"]


class TwoFactorSetupResponse(BaseModel):
    method: Literal["totp", "email"]
    totp_secret: str | None = None
    provisioning_uri: str | None = None


class TwoFactorEnableRequest(BaseModel):
    method: Literal["totp", "email"]
    code: str


class TwoFactorEnableResponse(BaseModel):
    message: str
    recovery_codes: list[str]


class TwoFactorDisableRequest(BaseModel):
    password: str | None = None
    code: str | None = None


# --- BR-89 Consent ---


class ConsentResponse(BaseModel):
    id: uuid.UUID
    type: str
    doc_version: str
    channel: str
    created_at: datetime
    revoked_at: datetime | None


class RecordConsentRequest(BaseModel):
    type: Literal["marketing_content", "academic_report", "cookie_analytics"]
    doc_version: str = Field(default="1.0", max_length=20)
    granted: bool = True


# --- BR-18 Login history ---


class LoginHistoryItem(BaseModel):
    id: uuid.UUID
    success: bool
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class LoginHistoryResponse(BaseModel):
    items: list[LoginHistoryItem]


# --- SF-11 Data export ---


class DataExportResponse(BaseModel):
    download_url: str
    expires_in: int
