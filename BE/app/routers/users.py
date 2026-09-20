from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    forbid_impersonation,
    get_current_user,
    get_impersonator_id,
    get_redis,
)
from app.schemas.user import (
    AvatarUploadRequest,
    AvatarUploadResponse,
    ChangePasswordRequest,
    ConsentResponse,
    DataExportResponse,
    DeleteAccountRequest,
    LoginHistoryResponse,
    MessageResponse,
    PrivacySettingsResponse,
    RecordConsentRequest,
    SetRecoveryEmailRequest,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorEnableResponse,
    TwoFactorSetupRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
    UpdatePrivacySettingsRequest,
    UpdateProfileRequest,
    UsageResponse,
    UserDetailResponse,
    VerifyRecoveryEmailRequest,
)
from app.services import admin_service, twofa_service, user_service

router = APIRouter()

@router.get("/me", response_model=UserDetailResponse)
async def get_me(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await user_service.get_profile(db, user)


@router.patch("/me", response_model=UserDetailResponse)
async def update_me(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.update_profile(db, user, body)


@router.post("/me/avatar", response_model=AvatarUploadResponse)
async def create_avatar_upload(
    body: AvatarUploadRequest, user=Depends(get_current_user)
):
    return user_service.create_avatar_upload(user, body)


@router.delete("/me/avatar", response_model=MessageResponse)
async def delete_avatar(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await user_service.delete_avatar(db, user)


@router.put("/me/password", response_model=MessageResponse, dependencies=[Depends(forbid_impersonation)])
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.change_password(db, user, body)


@router.delete("/me", response_model=MessageResponse, dependencies=[Depends(forbid_impersonation)])
async def delete_account(
    body: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.delete_account(db, user, body)


@router.get("/me/usage", response_model=UsageResponse)
async def get_usage(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await user_service.get_usage(db, user)


# --- BR-15 Privacy ---


@router.get("/me/privacy", response_model=PrivacySettingsResponse)
async def get_privacy_settings(user=Depends(get_current_user)):
    return user_service.get_privacy_settings(user)


@router.patch("/me/privacy", response_model=PrivacySettingsResponse)
async def update_privacy_settings(
    body: UpdatePrivacySettingsRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.update_privacy_settings(db, user, body)


# --- BR-89 Consent ---


@router.get("/me/consents", response_model=list[ConsentResponse])
async def list_consents(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await user_service.list_consents(db, user)


@router.post("/me/consents", response_model=ConsentResponse)
async def record_consent(
    body: RecordConsentRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.record_consent(db, user, body)


# --- BR-18 Login history ---


@router.get("/me/login-history", response_model=LoginHistoryResponse)
async def get_login_history(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    return await user_service.get_login_history(db, user)


# --- SF-11 Data export ---


@router.post("/me/data-export", response_model=DataExportResponse)
async def export_account_data(
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    user=Depends(get_current_user),
):
    return await user_service.export_account_data(db, redis, user)


# --- BR-12/13 Two-factor authentication ---


@router.get("/me/2fa", response_model=TwoFactorStatusResponse, dependencies=[Depends(forbid_impersonation)])
async def get_two_factor_status(user=Depends(get_current_user)):
    return twofa_service.get_status(user)


@router.post("/me/2fa/recovery-email", response_model=MessageResponse, dependencies=[Depends(forbid_impersonation)])
async def set_recovery_email(
    body: SetRecoveryEmailRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    user=Depends(get_current_user),
):
    return await twofa_service.set_recovery_email(db, redis, user, body.recovery_email)


@router.post("/me/2fa/recovery-email/verify", response_model=MessageResponse, dependencies=[Depends(forbid_impersonation)])
async def verify_recovery_email(
    body: VerifyRecoveryEmailRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    user=Depends(get_current_user),
):
    return await twofa_service.verify_recovery_email(db, redis, user, body.code)


@router.post("/me/2fa/setup", response_model=TwoFactorSetupResponse, dependencies=[Depends(forbid_impersonation)])
async def setup_two_factor(
    body: TwoFactorSetupRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    user=Depends(get_current_user),
):
    return await twofa_service.start_setup(db, redis, user, body.method)


@router.post("/me/2fa/enable", response_model=TwoFactorEnableResponse, dependencies=[Depends(forbid_impersonation)])
async def enable_two_factor(
    body: TwoFactorEnableRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    user=Depends(get_current_user),
):
    return await twofa_service.enable(db, redis, user, method=body.method, code=body.code)


@router.post("/me/2fa/disable", response_model=MessageResponse, dependencies=[Depends(forbid_impersonation)])
async def disable_two_factor(
    body: TwoFactorDisableRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await twofa_service.disable(db, user, password=body.password, code=body.code)


@router.post("/me/impersonation/end", response_model=MessageResponse)
async def end_impersonation(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    admin_id: str = Depends(get_impersonator_id),
):
    return await admin_service.end_impersonation(db, admin_id, user)
