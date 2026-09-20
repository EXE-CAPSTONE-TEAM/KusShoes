import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    confirm_password: str
    full_name: str
    # BR-02: self-certified >=16, must be explicitly ticked.
    age_confirmed: bool = False
    # BR-84: first-touch attribution, optional — FE reads these from the URL/cookie.
    utm_source: str | None = None
    utm_campaign: str | None = None
    referral_code: str | None = None

    @field_validator("age_confirmed")
    @classmethod
    def validate_age_confirmed(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Bạn cần xác nhận đã đủ 16 tuổi để đăng ký")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", v):
            raise ValueError("Tên đăng nhập chỉ gồm chữ cái, số, dấu gạch dưới (3–30 ký tự)")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mật khẩu tối thiểu 8 ký tự")
        if not any(c.isupper() for c in v):
            raise ValueError("Mật khẩu phải có ít nhất 1 chữ hoa")
        if not any(c.isdigit() for c in v):
            raise ValueError("Mật khẩu phải có ít nhất 1 chữ số")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 100:
            raise ValueError("Họ và tên phải từ 2 đến 100 ký tự")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("Mật khẩu xác nhận không khớp")
        return self


class RegisterResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    message: str


class OTPVerifyRequest(BaseModel):
    user_id: uuid.UUID
    otp_code: str

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP phải gồm đúng 6 chữ số")
        return v


class OTPResendRequest(BaseModel):
    user_id: uuid.UUID


class OTPResendResponse(BaseModel):
    message: str
    resend_remaining: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResult(BaseModel):
    """Either tokens (no 2FA / already passed) or a challenge to complete."""

    access_token: str | None = None
    token_type: str = "bearer"
    mfa_required: bool = False
    challenge_token: str | None = None
    method: str | None = None


class TwoFactorLoginVerifyRequest(BaseModel):
    challenge_token: str
    code: str | None = None
    recovery_code: str | None = None

    @model_validator(mode="after")
    def one_of_code_or_recovery(self) -> "TwoFactorLoginVerifyRequest":
        if not self.code and not self.recovery_code:
            raise ValueError("Cần nhập mã xác thực hoặc mã khôi phục")
        return self


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str
    confirm_password: str

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("Mã khôi phục phải gồm đúng 6 chữ số")
        return value

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < 8 or not any(c.isupper() for c in value) or not any(
            c.isdigit() for c in value
        ):
            raise ValueError("Mật khẩu mới cần tối thiểu 8 ký tự, 1 chữ hoa và 1 chữ số")
        return value

    @model_validator(mode="after")
    def passwords_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Mật khẩu xác nhận không khớp")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GoogleLoginResponse(TokenResponse):
    is_new_user: bool
    linked: bool = False


class AdminLoginResponse(TokenResponse):
    role: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class SSOCreateRequest(BaseModel):
    project_id: uuid.UUID


class SSOCreateResponse(BaseModel):
    sso_token: str
    expires_in: int


class SSOVerifyRequest(BaseModel):
    sso_token: str


class SSOVerifyResponse(BaseModel):
    user_id: uuid.UUID
    project_id: uuid.UUID
    email: str
    username: str


class SSODesktopSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    project_id: uuid.UUID
    email: str
    username: str
    name: str
    role: str
    created_at: datetime
    updated_at: datetime


class SessionResponse(BaseModel):
    id: uuid.UUID
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime


class SessionListResponse(BaseModel):
    items: list[SessionResponse]


class AccountRestoreConfirmRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6)
