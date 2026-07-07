import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    confirm_password: str
    full_name: str

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
    refresh_token: str
    token_type: str = "bearer"


class GoogleLoginResponse(TokenResponse):
    is_new_user: bool
    linked: bool = False


class AdminLoginResponse(TokenResponse):
    role: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    refresh_token: str


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


class SessionResponse(BaseModel):
    id: uuid.UUID
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime


class SessionListResponse(BaseModel):
    items: list[SessionResponse]
