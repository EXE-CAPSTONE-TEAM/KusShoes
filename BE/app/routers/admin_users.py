import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write
from app.schemas.admin import (
    AdminSearchQuery,
    AdminUserDetailResponse,
    AdminUserListItem,
    BanRequest,
    CursorPage,
    StaffCreateRequest,
    StaffCreateResponse,
    UserRole,
    UserStatus,
)
from app.services import admin_service
from app.utils.pagination import decode_cursor, encode_cursor

router = APIRouter()


@router.get("/users", response_model=CursorPage[AdminUserListItem])
async def list_users(
    q: AdminSearchQuery | None = None,
    status: UserStatus | None = None,
    role: UserRole | None = None,
    include_deleted: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded

    items = await admin_service.list_users(
        db, q=q, status=status, role=role,
        include_deleted=include_deleted, limit=limit, before=before, before_id=before_id,
    )
    
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)

    return CursorPage(items=items, next_cursor=next_cursor)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
async def get_user_detail(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    return await admin_service.get_user_detail(db, user_id)


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: uuid.UUID,
    body: BanRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.ban_user(db, admin, user_id, reason=body.reason)
    return {"status": "banned"}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.unban_user(db, admin, user_id)
    return {"status": "unbanned"}


@router.post("/staff", response_model=StaffCreateResponse, status_code=201)
async def create_staff(
    body: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await admin_service.create_staff(
        db,
        admin,
        email=body.email,
        username=body.username,
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
    )
