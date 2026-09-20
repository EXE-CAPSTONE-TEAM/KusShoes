import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, text
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


async def get_by_username_case_insensitive(db: AsyncSession, username: str) -> User | None:
    """BR-10: username uniqueness is case-insensitive."""
    result = await db.execute(
        select(User).where(func.lower(User.username) == username.lower())
    )
    return result.scalar_one_or_none()


async def set_username(db: AsyncSession, user: User, username: str) -> None:
    user.username = username
    user.username_changed_at = datetime.now(UTC)
    await db.flush()


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
    """Includes soft-deleted rows."""
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


async def set_totp_pending(db: AsyncSession, user: User, secret: str) -> None:
    """Secret is stored once setup starts; two_factor_enabled flips only on confirm."""
    user.totp_secret = secret
    await db.flush()


async def enable_two_factor(db: AsyncSession, user: User, method: str) -> None:
    user.two_factor_enabled = True
    user.two_factor_method = method
    await db.flush()


async def disable_two_factor(db: AsyncSession, user: User) -> None:
    user.two_factor_enabled = False
    user.two_factor_method = None
    user.totp_secret = None
    await db.flush()


async def set_recovery_email(db: AsyncSession, user: User, email: str) -> None:
    user.recovery_email = email
    user.recovery_email_verified = False
    await db.flush()


async def verify_recovery_email(db: AsyncSession, user: User) -> None:
    user.recovery_email_verified = True
    await db.flush()


async def set_internal(db: AsyncSession, user: User, is_internal: bool) -> None:
    user.is_internal = is_internal
    await db.flush()


async def get_deleted_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_not(None))
    )
    return result.scalar_one_or_none()


async def restore(db: AsyncSession, user: User) -> None:
    user.deleted_at = None
    await db.flush()



async def list_purgeable(db: AsyncSession, *, deleted_before: datetime) -> list[User]:
    """BR-06: soft-deleted accounts past the 30-day restore window that have
    not been anonymized yet."""
    result = await db.execute(
        select(User).where(
            User.deleted_at.is_not(None),
            User.deleted_at <= deleted_before,
            ~User.email.like("%@deleted.invalid"),
        )
    )
    return list(result.scalars())


async def anonymize(db: AsyncSession, user: User) -> None:
    """Drop every personal field but keep the row: invoices/receipts must
    outlive the account for accounting."""
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.username = f"deleted_{user.id.hex[:16]}"
    user.first_name = "Deleted"
    user.last_name = "User"
    user.password_hash = None
    user.google_id = None
    user.avatar_path = None
    user.recovery_email = None
    await db.flush()
