import uuid
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.utils.account_code import generate_account_code


async def get_by_id(db: AsyncSession, user_id: str | uuid.UUID) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    """Active users only (soft-delete aware)."""
    result = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_by_email_any(db: AsyncSession, email: str) -> User | None:
    """Includes soft-deleted — used for duplicate registration check."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(
        select(User).where(User.username == username, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_by_username_any(db: AsyncSession, username: str) -> User | None:
    """Includes soft-deleted — used for duplicate registration check."""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_by_google_id(db: AsyncSession, google_id: str) -> User | None:
    result = await db.execute(
        select(User).where(User.google_id == google_id, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_admin_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(
            User.email == email,
            User.role.in_(["admin", "staff"]),
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _next_account_code(db: AsyncSession) -> str:
    result = await db.execute(text("SELECT nextval('user_account_seq')"))
    seq = result.scalar()
    return generate_account_code(seq)


async def create_email_user(
    db: AsyncSession,
    *,
    email: str,
    username: str,
    password_hash: str,
    first_name: str,
    last_name: str,
    role: str = "user",
) -> User:
    account_code = await _next_account_code(db)
    user = User(
        email=email,
        username=username,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        account_code=account_code,
        is_verified=False,
        role=role,
    )
    db.add(user)
    await db.flush()  # populate id without committing
    return user


async def create_google_user(
    db: AsyncSession,
    *,
    email: str,
    google_id: str,
    first_name: str,
    last_name: str,
    username: str,
) -> User:
    account_code = await _next_account_code(db)
    user = User(
        email=email,
        google_id=google_id,
        first_name=first_name,
        last_name=last_name,
        username=username,
        account_code=account_code,
        is_verified=True,
        role="user",
    )
    db.add(user)
    await db.flush()
    return user


async def set_verified(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await get_by_id(db, user_id)
    if user:
        user.is_verified = True


async def set_google_id(db: AsyncSession, user_id: uuid.UUID, google_id: str) -> None:
    user = await get_by_id(db, user_id)
    if user:
        user.google_id = google_id
        user.is_verified = True


async def set_verified_google_link(db: AsyncSession, user: User, google_id: str) -> None:
    """Auto-link: set google_id and mark verified in one operation."""
    user.google_id = google_id
    user.is_verified = True


async def update_last_login(db: AsyncSession, user: User) -> None:
    user.updated_at = datetime.now(UTC)


async def soft_delete(db: AsyncSession, user: User) -> None:
    user.deleted_at = datetime.now(UTC)
    await db.flush()


async def update_fields(db: AsyncSession, user: User, changes: dict) -> User:
    for field, value in changes.items():
        setattr(user, field, value)
    await db.flush()
    return user


async def clear_avatar(db: AsyncSession, user: User) -> str | None:
    previous_path = user.avatar_path
    user.avatar_path = None
    await db.flush()
    return previous_path


async def set_password_hash(db: AsyncSession, user: User, password_hash: str) -> None:
    user.password_hash = password_hash
    await db.flush()


async def get_by_id_any(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Includes soft-deleted — for admin detail views."""
    return await db.get(User, user_id)


async def list_admin(
    db: AsyncSession,
    *,
    q: str | None = None,
    status: str | None = None,
    role: str | None = None,
    include_deleted: bool = False,
    limit: int = 20,
    before: datetime | None = None,
    before_id: uuid.UUID | None = None,
) -> list[User]:
    query = select(User)
    if q:
        pattern = f"%{q}%"
        query = query.where(User.email.ilike(pattern) | User.username.ilike(pattern))
    if status is not None:
        query = query.where(User.status == status)
    if role is not None:
        query = query.where(User.role == role)
    if not include_deleted:
        query = query.where(User.deleted_at.is_(None))
    if before is not None:
        if before_id is not None:
            query = query.where((User.created_at < before) | ((User.created_at == before) & (User.id < before_id)))
        else:
            query = query.where(User.created_at < before)
    query = query.order_by(User.created_at.desc(), User.id.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())


async def set_status(db: AsyncSession, user: User, status: str) -> None:
    user.status = status
    await db.flush()
