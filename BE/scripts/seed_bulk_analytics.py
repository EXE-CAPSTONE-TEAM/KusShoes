"""Bulk-seed a large volume of historical data so Admin analytics/dashboards have
plenty to show: hundreds of users spread across the last 12 months (skewed toward
recent months for a believable growth curve), invoices to drive MRR/revenue charts,
daily API cost entries, content reports and feedback.

Run from the API container (after scripts.seed_demo_data, though not required):
    python -m scripts.seed_bulk_analytics

Not idempotent the way seed_demo_data is — each user email/username is unique
(bulk0000@example.com, bulk0001@example.com, ...) so re-running with a different
COUNT just adds more; re-running with the same COUNT updates the existing rows via
the shared _ensure_user/_ensure_invoice helpers instead of duplicating users, but
does append additional API cost / report / feedback rows each time.
"""

from __future__ import annotations

import asyncio
import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.api_budget_period import ApiBudgetPeriod
from app.models.api_cost_entry import ApiCostEntry
from app.models.content_report import ContentReport
from app.models.feedback import Feedback
from app.models.project import Project
from app.utils.password import hash_password
from scripts.seed_demo_data import _ensure_invoice, _ensure_subscription, _ensure_user, _plans

random.seed(20260924)  # reproducible run-to-run

PASSWORD = "password123"
USER_COUNT = 180
MONTHS_BACK = 12

FIRST_NAMES = [
    "Linh", "Minh", "An", "Khoa", "Vy", "Bao", "Nhi", "Dat", "Gia", "Hana",
    "Quan", "Mia", "Tuan", "Lan", "Huy", "Thao", "Phong", "Trang", "Nam", "Mai",
    "Duc", "Hoa", "Long", "Chi", "Kien", "My", "Son", "Hue", "Tam", "Yen",
    "Khanh", "Vinh", "Nga", "Tung", "Xuan", "Bich", "Quang", "Diep", "Anh", "Phuc",
]
LAST_NAMES = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui", "Do", "Ho", "Ngo", "Duong", "Ly"]

# (tier, billing_cycle) -> share of new signups. Matches the Plan rows seeded by migrations.
PLAN_WEIGHTS: list[tuple[tuple[str, str | None], float]] = [
    (("free", None), 0.40),
    (("basic", "monthly"), 0.22),
    (("basic", "yearly"), 0.10),
    (("pro", "monthly"), 0.18),
    (("pro", "yearly"), 0.10),
]

FEEDBACK_MESSAGES = [
    "Muốn có thêm nhiều template giày hơn nữa.",
    "Giá gói Pro hơi cao so với sinh viên.",
    "Studio load model hơi chậm trên máy cấu hình yếu.",
    "Rất thích tính năng export GLB, dùng mượt.",
    "Nên có thêm màu pastel cho phần đế giày.",
    "Quy trình quét 3D trên mobile khá dễ dùng.",
    "Mong sớm có tính năng vẽ tay trực tiếp trên giày.",
    "Hỗ trợ khách hàng phản hồi khá nhanh, cảm ơn team.",
]


def _now() -> datetime:
    return datetime.now(UTC)


def _weighted_plan() -> tuple[str, str | None]:
    roll = random.random()
    acc = 0.0
    for key, weight in PLAN_WEIGHTS:
        acc += weight
        if roll <= acc:
            return key
    return PLAN_WEIGHTS[-1][0]


async def _bulk_users(db) -> list[tuple[object, tuple[str, str | None]]]:
    password_hash = hash_password(PASSWORD)
    plan_map = await _plans(db)
    users: list[tuple[object, tuple[str, str | None]]] = []

    for i in range(USER_COUNT):
        # Triangular distribution skewed toward "recent" (mode close to 0) so the
        # user-growth chart shows more signups in the last few months than a year ago.
        months_ago = int(random.triangular(0, MONTHS_BACK, 1.5))
        days_ago = months_ago * 30 + random.randint(0, 29)
        created_at = _now() - timedelta(days=days_ago)

        email = f"bulk{i:04d}@example.com"
        username = f"bulk_{i:04d}"
        status = "suspended" if random.random() < 0.03 else "active"
        plan_key = _weighted_plan()
        spec = (email, username, random.choice(FIRST_NAMES), random.choice(LAST_NAMES), status, plan_key)

        user = await _ensure_user(db, spec, password_hash, created_at)

        sub_status = "active"
        if plan_key[1] is not None and random.random() < 0.08:
            sub_status = random.choice(["cancelled", "expired", "grace"])
        subscription = await _ensure_subscription(
            db, user=user, plan=plan_map[plan_key], plan_key=plan_key, status=sub_status, index=i
        )
        users.append((user, plan_key))

        if plan_key[1] is None:
            continue

        # 1-5 billing cycles' worth of invoices, walking forward from signup toward now.
        invoice_count = random.randint(1, 5)
        for sequence in range(1, invoice_count + 1):
            invoice_months_ago = max(0, months_ago - (sequence - 1) * random.randint(1, 3))
            roll = random.random()
            if roll < 0.84:
                inv_status = "paid"
            elif roll < 0.92:
                inv_status = "refunded"
            elif roll < 0.97:
                inv_status = "failed"
            else:
                inv_status = "pending"
            invoice = await _ensure_invoice(
                db,
                user=user,
                plan=plan_map[plan_key],
                status=inv_status,
                months_ago=invoice_months_ago,
                sequence=sequence,
            )
            if inv_status == "paid" and sequence == 1:
                subscription.last_invoice_id = invoice.id

    return users


async def _bulk_api_cost(db, days: int = 75) -> None:
    for offset in range(days):
        day = date.today() - timedelta(days=offset)
        for call in range(random.randint(8, 40)):
            status = "success" if random.random() < 0.92 else "failed"
            occurred_at = datetime.combine(day, datetime.min.time(), UTC) + timedelta(
                hours=random.randint(0, 23), minutes=random.randint(0, 59)
            )
            db.add(
                ApiCostEntry(
                    user_id=None,
                    provider=random.choice(["kiri", "openai", "blender"]),
                    operation=random.choice(["scan_reconstruct", "bg_removal", "mesh_cleanup"]),
                    status=status,
                    cost_vnd=random.randint(1500, 25000),
                    reference=f"bulk-{offset}-{call}",
                    occurred_on=day,
                    occurred_at=occurred_at,
                )
            )

    for months_ago in range(3):
        period = (date.today().replace(day=1) - timedelta(days=30 * months_ago)).replace(day=1)
        existing = (
            await db.execute(select(ApiBudgetPeriod).where(ApiBudgetPeriod.period_month == period))
        ).scalar_one_or_none()
        if not existing:
            db.add(ApiBudgetPeriod(period_month=period, budget_vnd=5_000_000))


async def _bulk_content_reports(db, count: int = 18) -> None:
    projects = (await db.execute(select(Project).limit(300))).scalars().all()
    if not projects:
        return
    reasons = ["copyright", "trademark", "inappropriate", "other"]
    statuses = ["new", "reviewing", "upheld", "dismissed"]
    for i in range(count):
        project = random.choice(projects)
        status = random.choices(statuses, weights=[0.35, 0.15, 0.25, 0.25])[0]
        db.add(
            ContentReport(
                project_id=project.id,
                reported_user_id=project.user_id,
                reporter_email=f"reporter{i}@example.com",
                reporter_name=f"Reporter {i}",
                reason=random.choice(reasons),
                details=f"Seeded demo report #{i}: possible unauthorized use of a registered trademark on this design.",
                status=status,
                resolution_note="Reviewed against the brand guideline list." if status in ("upheld", "dismissed") else None,
                created_at=_now() - timedelta(days=random.randint(0, 200)),
            )
        )


async def _bulk_feedback(db, user_ids: list, count: int = 60) -> None:
    groups = ["product", "price", "place", "promotion"]
    statuses = ["new", "reviewed", "planned", "done", "wont_do"]
    for _ in range(count):
        db.add(
            Feedback(
                user_id=random.choice(user_ids),
                rating=random.randint(1, 5),
                marketing_group=random.choice(groups),
                message=random.choice(FEEDBACK_MESSAGES),
                is_internal=False,
                status=random.choices(statuses, weights=[0.3, 0.25, 0.15, 0.2, 0.1])[0],
                created_at=_now() - timedelta(days=random.randint(0, 200)),
            )
        )


async def main() -> None:
    async with AsyncSessionLocal() as db:
        users = await _bulk_users(db)
        await db.commit()
        user_ids = [user.id for user, _ in users]
        print(f"Seeded {len(users)} bulk users (+ subscriptions + invoices)")

    async with AsyncSessionLocal() as db:
        await _bulk_api_cost(db)
        await db.commit()
        print("Seeded API cost entries + budget periods")

    async with AsyncSessionLocal() as db:
        await _bulk_content_reports(db)
        await db.commit()
        print("Seeded content reports")

    async with AsyncSessionLocal() as db:
        await _bulk_feedback(db, user_ids)
        await db.commit()
        print("Seeded feedback")


if __name__ == "__main__":
    asyncio.run(main())
