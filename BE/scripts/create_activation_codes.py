"""Tạo N mã kích hoạt gói (coupon grant_plan), mỗi mã dùng được đúng 1 lần.

Chạy trong container api (cần migration 034 đã áp dụng):

    docker compose exec -T -e ADMIN_EMAIL=admin@example.com api \
        python -m scripts.create_activation_codes --count 10 --days 30 --valid-until 2026-11-15

Mã in ra stdout, một mã mỗi dòng — đó là lần duy nhất script hiển thị chúng, đừng commit.
Mỗi lần chạy tạo mã MỚI (mã ngẫu nhiên, không idempotent). Audit ghi dưới tài khoản ADMIN_EMAIL.
"""
import argparse
import asyncio
import os
import secrets
import sys
from datetime import UTC, datetime, time, timedelta, timezone

from app.database import AsyncSessionLocal
from app.exceptions import CouponInvalid
from app.repositories import user_repo
from app.services import coupon_service

# Bỏ 0/O, 1/I/L để mã đọc/gõ lại không nhầm.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
# 2 nhóm x 4 ký tự: 31^8 ≈ 8.5e11 khả năng; với giới hạn 10 lần thử/phút/tài khoản
# (coupon_service.REDEEM_ATTEMPTS_PER_WINDOW), đoán trúng một mã còn hiệu lực là không thực tế.
GROUP_LEN = 4
GROUPS = 2
# Giờ Việt Nam (UTC+7) — cùng quy ước hết hạn với form Admin (23:59:59+07:00).
VN_TZ = timezone(timedelta(hours=7))
# Trần số lần sinh lại khi trùng mã; trùng gần như không xảy ra nên chạm trần = lỗi bất thường.
MAX_COLLISION_RETRIES = 20
# Trần mỗi lần chạy: chặn gõ nhầm (vd. 1000) tạo hàng loạt mã cấp quyền miễn phí.
MAX_CODES_PER_RUN = 100


def generate_code(prefix: str) -> str:
    groups = ["".join(secrets.choice(CODE_ALPHABET) for _ in range(GROUP_LEN)) for _ in range(GROUPS)]
    return "-".join([prefix, *groups])


def parse_valid_until(value: str | None) -> datetime | None:
    if not value:
        return None
    day = datetime.strptime(value, "%Y-%m-%d").date()
    return datetime.combine(day, time(23, 59, 59), tzinfo=VN_TZ).astimezone(UTC)


async def create_codes(
    db,
    admin,
    *,
    count: int,
    days: int,
    tier: str = "basic",
    prefix: str = "KUS",
    valid_until: datetime | None = None,
) -> list[str]:
    created: list[str] = []
    collisions = 0
    while len(created) < count:
        code = generate_code(prefix)
        try:
            await coupon_service.create_coupon(
                db,
                admin,
                {
                    "code": code,
                    "discount_type": coupon_service.GRANT_PLAN,
                    "value": days,
                    "plan_tiers": [tier],
                    "max_uses": 1,
                    "valid_from": None,
                    "valid_until": valid_until,
                },
            )
        except CouponInvalid:
            # create_coupon also raises this for a duplicate code; only retry when it is one.
            collisions += 1
            if collisions > MAX_COLLISION_RETRIES:
                raise
            await db.rollback()
            continue
        created.append(code)
    return created


async def _main(args: argparse.Namespace) -> int:
    email = os.environ.get("ADMIN_EMAIL")
    if not email:
        print("Cần ADMIN_EMAIL (tài khoản admin để ghi audit).", file=sys.stderr)
        return 1
    async with AsyncSessionLocal() as db:
        admin = await user_repo.get_by_email_any(db, email)
        if not admin or admin.role != "admin":
            print(f"{email} không phải tài khoản admin.", file=sys.stderr)
            return 1
        codes = await create_codes(
            db,
            admin,
            count=args.count,
            days=args.days,
            tier=args.tier,
            prefix=args.prefix.upper(),
            valid_until=parse_valid_until(args.valid_until),
        )
    for code in codes:
        print(code)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--days", type=int, required=True, help="số ngày dùng thử (1-365)")
    parser.add_argument("--tier", choices=["basic", "pro"], default="basic")
    parser.add_argument("--prefix", default="KUS", help="tiền tố mã, mặc định KUS")
    parser.add_argument("--valid-until", help="YYYY-MM-DD, hết hạn 23:59:59 giờ VN; bỏ trống = không hết hạn")
    args = parser.parse_args()
    if not 1 <= args.count <= MAX_CODES_PER_RUN:
        parser.error(f"--count phải trong 1..{MAX_CODES_PER_RUN}")
    if not 1 <= args.days <= coupon_service.GRANT_PLAN_MAX_DAYS:
        parser.error(f"--days phải trong 1..{coupon_service.GRANT_PLAN_MAX_DAYS}")
    sys.exit(asyncio.run(_main(args)))


if __name__ == "__main__":
    main()
