import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_admin, get_current_admin_write, get_redis
from app.schemas.admin import (
    AdminSearchQuery,
    AdminUserDetailResponse,
    AdminUserListItem,
    BanRequest,
    CursorPage,
    ImpersonateRequest,
    ImpersonateResponse,
    SetInternalRequest,
    StaffCreateRequest,
    StaffCreateResponse,
    UserRole,
    UserStatus,
)
from app.schemas.finance import GrantCompRequest
from app.services import admin_service, finance_service
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


@router.post("/users/{user_id}/internal")
async def set_user_internal(
    user_id: uuid.UUID,
    body: SetInternalRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    await admin_service.set_user_internal(db, admin, user_id, is_internal=body.is_internal)
    return {"status": "updated", "is_internal": body.is_internal}


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


@router.post("/users/{user_id}/grant-plan")
async def grant_comp_plan(
    user_id: uuid.UUID,
    body: GrantCompRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    subscription = await finance_service.grant_comp_plan(
        db, admin, user_id, **body.model_dump()
    )
    return {"status": "granted", "tier": subscription.tier, "is_comp": True}


@router.post("/users/{user_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate_user(
    user_id: uuid.UUID,
    body: ImpersonateRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_write),
):
    return await admin_service.start_impersonation(db, admin, user_id, reason=body.reason)


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    admin=Depends(get_current_admin_write),
):
    return await admin_service.admin_reset_user_password(db, redis, admin, user_id)
