"""Seed script tạo tài khoản Admin đầu tiên.

Chạy: python -m scripts.create_admin
Env vars: ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD (fallback: nhập interactive).
Idempotent: email đã tồn tại → thoát với mã 0.
"""
import asyncio
import os
import sys
from getpass import getpass

from app.database import AsyncSessionLocal
from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo
from app.utils.password import hash_password


def _get_inputs() -> tuple[str, str, str]:
    email = os.environ.get("ADMIN_EMAIL") or input("Admin email: ").strip()
    username = os.environ.get("ADMIN_USERNAME") or input("Admin username: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass("Admin password (>= 8 ký tự): ")
    if not email or not username:
        print("Email và username không được để trống", file=sys.stderr)
        sys.exit(1)
    if len(password) < 8:
        print("Mật khẩu phải có ít nhất 8 ký tự", file=sys.stderr)
        sys.exit(1)
    return email, username, password


async def _create_admin(email: str, username: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        existing = await user_repo.get_by_email_any(db, email)
        if existing:
            print(f"Tài khoản {email} đã tồn tại (role={existing.role}) — bỏ qua.")
            return
        if await user_repo.get_by_username_any(db, username):
            print(f"Username {username} đã được sử dụng", file=sys.stderr)
            sys.exit(1)

        user = await user_repo.create_email_user(
            db,
            email=email,
            username=username,
            password_hash=hash_password(password),
            first_name="Admin",
            last_name="KusShoes",
            role="admin",
        )
        user.is_verified = True

        # Parity với register_user: subscription free + monthly_usage
        free_plan = await plan_repo.get_free_plan(db)
        if free_plan:
            await subscription_repo.create_free(db, user_id=user.id, plan_id=free_plan.id)
        await monthly_usage_repo.create_for_user(db, user_id=user.id)

        await db.commit()
        print(f"Đã tạo admin: {user.email} · {user.account_code}")


def main() -> None:
    email, username, password = _get_inputs()
    asyncio.run(_create_admin(email, username, password))


if __name__ == "__main__":
    main()
