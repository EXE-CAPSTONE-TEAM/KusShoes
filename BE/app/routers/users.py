from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.user import (
    AvatarUploadRequest,
    AvatarUploadResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    MessageResponse,
    UpdateProfileRequest,
    UsageResponse,
    UserDetailResponse,
)
from app.services import user_service

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


@router.put("/me/password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await user_service.change_password(db, user, body)


@router.delete("/me", response_model=MessageResponse)
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
