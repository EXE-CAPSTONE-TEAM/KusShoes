"""Seed richer local demo data for FE/BE development.

Run from the API container:
    python -m scripts.seed_demo_data

The script is idempotent. It updates existing demo rows and creates missing rows
using stable emails, usernames, project names, and gateway transaction IDs.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.audit_log import AuditLog
from app.models.bake_job import BakeJob
from app.models.export_record import ExportRecord
from app.models.invoice import Invoice
from app.models.monthly_usage import MonthlyUsage
from app.models.plan import Plan
from app.models.project import Project
from app.models.project_asset import ProjectAsset
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import user_repo
from app.utils.password import hash_password
from scripts.seed_users import seed_users

PASSWORD = "password123"

USER_SPECS = [
    ("user1@example.com", "user1", "Linh", "Sneaker", "active", ("pro", "monthly")),
    ("user2@example.com", "user2", "Minh", "Customizer", "active", ("basic", "monthly")),
    ("user3@example.com", "user3", "An", "Studio", "active", ("basic", "yearly")),
    ("user4@example.com", "user4", "Khoa", "Workshop", "active", ("free", None)),
    ("user5@example.com", "user5", "Vy", "Designer", "active", ("pro", "yearly")),
    ("user6@example.com", "user6", "Bao", "Suspended", "suspended", ("basic", "monthly")),
    ("user7@example.com", "user7", "Nhi", "Runner", "active", ("free", None)),
    ("user8@example.com", "user8", "Dat", "Maker", "active", ("basic", "monthly")),
    ("demo.creator01@example.com", "demo_creator01", "Gia", "Creator", "active", ("basic", "monthly")),
    ("demo.creator02@example.com", "demo_creator02", "Hana", "Atelier", "active", ("basic", "yearly")),
    ("demo.pro01@example.com", "demo_pro01", "Quan", "Pro", "active", ("pro", "monthly")),
    ("demo.pro02@example.com", "demo_pro02", "Mia", "Lab", "active", ("pro", "yearly")),
    ("demo.free01@example.com", "demo_free01", "Tuan", "Free", "active", ("free", None)),
    ("demo.free02@example.com", "demo_free02", "Lan", "Trial", "active", ("free", None)),
]

PROJECT_BLUEPRINTS = [
    ("Air Jordan 1 Retro", "iPhone 15 Pro", 118, 72.4, "1.22M", "#FF5A36"),
    ("Adidas Campus 00s", "iPad Pro", 84, 48.1, "860K", "#6C63FF"),
    ("Nike Air Max 90", "Samsung Galaxy Fold", 96, 58.9, "980K", "#34D399"),
    ("Converse Chuck 70", "iPhone 14 Pro", 64, 36.5, "610K", "#F59E0B"),
    ("New Balance 550", "Pixel 9 Pro", 102, 63.8, "1.05M", "#E61E43"),
    ("Vans Old Skool", "iPhone 15", 76, 41.2, "740K", "#3B82F6"),
    ("Puma Palermo", "Galaxy S25", 88, 52.7, "910K", "#14B8A6"),
    ("Asics Gel-Kayano 14", "iPad Air", 110, 69.3, "1.18M", "#A855F7"),
]

STATUSES = ["draft", "in_progress", "baking", "completed"]


def _now() -> datetime:
    return datetime.now(UTC)


def _naive(value: datetime) -> datetime:
    return value.replace(tzinfo=None)


def _first_of_month(months_ago: int = 0) -> date:
    current = date.today().replace(day=1)
    year = current.year
    month = current.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _subscription_tier(plan_key: tuple[str, str | None]) -> str:
    tier, cycle = plan_key
    return "free" if cycle is None else f"{tier}_{cycle}"


def _design_config(
    *,
    base_model: str,
    device: str,
    photos: int,
    file_size_mb: float,
    vertices: str,
    color: str,
    status: str,
    index: int,
) -> dict:
    return {
        "seed": "demo",
        "base_model": base_model,
        "visibility": "Private",
        "scan": {
            "device": device,
            "photos_count": photos,
            "file_size_mb": file_size_mb,
            "vertices": vertices,
            "capture_mode": "mobile_photogrammetry",
        },
        "palette": {
            "primary": color,
            "accent": "#0B0B0C" if index % 2 == 0 else "#FFFFFF",
        },
        "materials": {
            "upper": "leather" if index % 2 == 0 else "suede",
            "sole": "rubber",
            "lace": "cotton",
        },
        "workflow": {
            "status": status,
            "last_desktop_sync": (_now() - timedelta(hours=index + 1)).isoformat(),
        },
    }


async def _plans(db) -> dict[tuple[str, str | None], Plan]:
    rows = (await db.execute(select(Plan))).scalars().all()
    return {(plan.tier, plan.billing_cycle): plan for plan in rows}


async def _ensure_user(db, spec: tuple, password_hash: str, created_at: datetime) -> User:
    email, username, first_name, last_name, status, _plan_key = spec
    user = await user_repo.get_by_email_any(db, email)
    if not user:
        user = await user_repo.create_email_user(
            db,
            email=email,
            username=username,
            password_hash=password_hash,
            first_name=first_name,
            last_name=last_name,
            role="user",
        )
    user.username = username
    user.first_name = first_name
    user.last_name = last_name
    user.password_hash = password_hash
    user.is_verified = True
    user.status = status
    user.language = "vi"
    phone_seed = sum((index + 1) * ord(char) for index, char in enumerate(email))
    user.phone_number = f"+8490{phone_seed % 10000000:07d}"
    user.bio = "Demo account seeded from the local development database."
    user.preferred_styles = ["retro", "streetwear", "custom-paint"]
    user.deleted_at = None
    user.created_at = created_at
    user.updated_at = _now()
    await db.flush()
    return user


async def _ensure_subscription(
    db,
    *,
    user: User,
    plan: Plan,
    plan_key: tuple[str, str | None],
    status: str,
    index: int,
) -> Subscription:
    sub = (
        await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalar_one_or_none()
    if not sub:
        sub = Subscription(user_id=user.id, plan_id=plan.id)
        db.add(sub)
    sub.plan_id = plan.id
    sub.tier = _subscription_tier(plan_key)
    sub.status = status
    sub.started_at = _now() - timedelta(days=90 + index * 3)
    sub.expires_at = None if plan_key[1] is None else _now() + timedelta(days=24 + index)
    if status == "expired":
        sub.expires_at = _now() - timedelta(days=7)
    sub.cancel_at_period_end = status == "cancelled"
    await db.flush()
    return sub


async def _ensure_invoice(
    db,
    *,
    user: User,
    plan: Plan,
    status: str,
    months_ago: int,
    sequence: int,
) -> Invoice:
    gateway_id = f"demo-{user.username}-{months_ago}-{sequence}-{status}"
    order_code = int(hashlib.sha256(gateway_id.encode()).hexdigest()[:12], 16)
    invoice = (
        await db.execute(
            select(Invoice).where(Invoice.gateway_transaction_id == gateway_id)
        )
    ).scalar_one_or_none()
    created_at = _now() - timedelta(days=30 * months_ago + sequence)
    if not invoice:
        invoice = Invoice(
            user_id=user.id,
            plan_id=plan.id,
            plan_tier=plan.tier,
            billing_cycle=plan.billing_cycle or "free",
            order_code=order_code,
            listed_price_vnd=plan.price_vnd,
            amount_vnd=plan.price_vnd,
            payment_method="payos",
            gateway_transaction_id=gateway_id,
        )
        db.add(invoice)
    invoice.user_id = user.id
    invoice.plan_id = plan.id
    invoice.plan_tier = plan.tier
    invoice.billing_cycle = plan.billing_cycle or "free"
    invoice.listed_price_vnd = plan.price_vnd
    invoice.discount_vnd = 0
    invoice.amount_vnd = plan.price_vnd
    invoice.status = status
    invoice.paid_at = created_at + timedelta(minutes=12) if status in {"paid", "refunded"} else None
    invoice.payment_reference = f"demo-ref-{sequence}" if status in {"paid", "refunded"} else None
    invoice.gateway_payment_url = f"https://pay.payos.vn/web/demo/{gateway_id}"
    invoice.gateway_metadata = {"seed": "demo", "gateway": "payos", "sequence": sequence}
    invoice.created_at = created_at
    invoice.updated_at = created_at
    await db.flush()
    return invoice


async def _ensure_project(
    db,
    *,
    user: User,
    name: str,
    description: str,
    status: str,
    config: dict,
    created_at: datetime,
    deleted: bool,
) -> Project:
    project = (
        await db.execute(
            select(Project).where(Project.user_id == user.id, Project.name == name)
        )
    ).scalar_one_or_none()
    if not project:
        project = Project(user_id=user.id, name=name)
        db.add(project)
    project.description = description
    project.status = status
    project.design_config = config
    project.thumbnail_path = None
    project.created_at = created_at
    project.updated_at = created_at + timedelta(hours=6)
    project.deleted_at = _now() - timedelta(days=2) if deleted else None
    await db.flush()
    return project


async def _ensure_asset(
    db,
    *,
    project: Project,
    user: User,
    asset_type: str,
    filename: str,
    file_size_bytes: int,
    mime_type: str,
    metadata: dict,
) -> ProjectAsset:
    file_path = f"demo/{user.username}/{project.id}/{filename}"
    asset = (
        await db.execute(select(ProjectAsset).where(ProjectAsset.file_path == file_path))
    ).scalar_one_or_none()
    if not asset:
        asset = ProjectAsset(project_id=project.id, user_id=user.id, file_path=file_path)
        db.add(asset)
    asset.asset_type = asset_type
    asset.original_filename = filename
    asset.file_size_bytes = file_size_bytes
    asset.mime_type = mime_type
    asset.status = "ready"
    asset.metadata_ = metadata | {"seed": "demo"}
    asset.created_at = _naive(project.created_at + timedelta(minutes=15))
    await db.flush()
    return asset


async def _ensure_bake_job(
    db,
    *,
    project: Project,
    status: str,
    priority: str,
    index: int,
) -> BakeJob:
    job = (
        await db.execute(
            select(BakeJob)
            .where(BakeJob.project_id == project.id)
            .order_by(BakeJob.queued_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    queued_at = project.updated_at + timedelta(minutes=20)
    if not job:
        job = BakeJob(project_id=project.id, design_config_snapshot=project.design_config or {})
        db.add(job)
    job.design_config_snapshot = (project.design_config or {}) | {"seed_job": str(project.id)}
    job.status = status
    job.priority = priority
    job.queued_at = queued_at
    job.started_at = queued_at + timedelta(minutes=5) if status in {"claimed", "completed", "failed", "cancelled"} else None
    job.completed_at = queued_at + timedelta(minutes=45) if status in {"completed", "failed", "cancelled"} else None
    job.worker_id = f"demo-desktop-{index % 4 + 1}" if status in {"claimed", "completed", "failed"} else None
    job.error_message = "Source mesh has insufficient overlap around heel collar." if status == "failed" else None
    await db.flush()
    return job


async def _ensure_export(
    db,
    *,
    project: Project,
    job: BakeJob,
    user: User,
    fmt: str,
    file_size_bytes: int,
    index: int,
) -> ExportRecord:
    file_path = f"exports/{user.username}/{project.id}/demo-export-{index}.{fmt}"
    record = (
        await db.execute(select(ExportRecord).where(ExportRecord.file_path == file_path))
    ).scalar_one_or_none()
    if not record:
        record = ExportRecord(
            project_id=project.id,
            bake_job_id=job.id,
            user_id=user.id,
            format=fmt,
            file_path=file_path,
        )
        db.add(record)
    record.project_id = project.id
    record.bake_job_id = job.id
    record.user_id = user.id
    record.format = fmt
    record.file_size_bytes = file_size_bytes
    record.download_count = (index + 1) * 2
    record.created_at = (job.completed_at or _now()) + timedelta(minutes=index + 1)
    await db.flush()
    return record


async def _ensure_audit(
    db,
    *,
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    payload: dict | None = None,
) -> None:
    existing = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.action == action,
                AuditLog.target_type == target_type,
                AuditLog.target_id == target_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.payload = payload
        existing.created_at = _now() - timedelta(hours=1)
        return
    db.add(
        AuditLog(
            actor_id=actor.id,
            actor_role=actor.role,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            created_at=_now() - timedelta(hours=1),
        )
    )


async def _sync_usage(db, user: User) -> None:
    month = _first_of_month()
    period_start = datetime.combine(month, datetime.min.time(), UTC)
    usage = (
        await db.execute(
            select(MonthlyUsage).where(
                MonthlyUsage.user_id == user.id,
                MonthlyUsage.period_start == period_start,
            )
        )
    ).scalar_one_or_none()
    if not usage:
        usage = MonthlyUsage(user_id=user.id, period_start=period_start)
        db.add(usage)
    active_projects = (
        await db.execute(
            select(func.count(Project.id)).where(
                Project.user_id == user.id,
                Project.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    current_exports = (
        await db.execute(
            select(func.count(ExportRecord.id)).where(
                ExportRecord.user_id == user.id,
                ExportRecord.created_at >= period_start,
            )
        )
    ).scalar_one()
    usage.projects_count = int(active_projects or 0)
    usage.exports_count = int(current_exports or 0)
    usage.ai_credits_used = usage.projects_count * 18 + usage.exports_count * 4
    usage.updated_at = _naive(_now())

    for months_ago in range(1, 5):
        past_month = _first_of_month(months_ago)
        past_period_start = datetime.combine(past_month, datetime.min.time(), UTC)
        past = (
            await db.execute(
                select(MonthlyUsage).where(
                    MonthlyUsage.user_id == user.id,
                    MonthlyUsage.period_start == past_period_start,
                )
            )
        ).scalar_one_or_none()
        if not past:
            past = MonthlyUsage(user_id=user.id, period_start=past_period_start)
            db.add(past)
        past.projects_count = max(0, usage.projects_count - months_ago)
        past.exports_count = max(0, usage.exports_count - months_ago * 2)
        past.ai_credits_used = past.projects_count * 12 + past.exports_count * 3
        past.updated_at = _naive(_now() - timedelta(days=30 * months_ago))


async def seed_demo_data() -> None:
    await seed_users()
    password_hash = hash_password(PASSWORD)
    async with AsyncSessionLocal() as db:
        plan_map = await _plans(db)
        missing = [
            key for key in {spec[5] for spec in USER_SPECS}
            if key not in plan_map
        ]
        if missing:
            raise RuntimeError(f"Missing plan rows: {missing}")

        admin = await user_repo.get_by_email_any(db, "admin2@kusshoes.vn")
        if not admin:
            raise RuntimeError("admin2@kusshoes.vn must exist after seed_users")

        users: list[tuple[User, tuple[str, str | None]]] = []
        for index, spec in enumerate(USER_SPECS):
            created_at = _now() - timedelta(days=170 - index * 8)
            user = await _ensure_user(db, spec, password_hash, created_at)
            plan_key = spec[5]
            sub_status = "active"
            if spec[1] == "demo_free02":
                sub_status = "expired"
            elif spec[1] == "demo_creator02":
                sub_status = "cancelled"
            subscription = await _ensure_subscription(
                db,
                user=user,
                plan=plan_map[plan_key],
                plan_key=plan_key,
                status=sub_status,
                index=index,
            )
            users.append((user, plan_key))

            if plan_key[1] is not None:
                statuses = ["paid", "paid", "paid", "pending" if index % 3 else "failed"]
                for sequence, status in enumerate(statuses, start=1):
                    invoice = await _ensure_invoice(
                        db,
                        user=user,
                        plan=plan_map[plan_key],
                        status=status,
                        months_ago=sequence,
                        sequence=sequence,
                    )
                    if status == "paid" and sequence == 1:
                        subscription.last_invoice_id = invoice.id

        all_projects: list[tuple[Project, User, tuple[str, str | None], int]] = []
        for user_index, (user, plan_key) in enumerate(users):
            project_count = 8 if user.email == "user1@example.com" else 4 if user_index < 8 else 3
            for project_index in range(project_count):
                blueprint = PROJECT_BLUEPRINTS[(user_index + project_index) % len(PROJECT_BLUEPRINTS)]
                base_model, device, photos, file_size_mb, vertices, color = blueprint
                status = STATUSES[(user_index + project_index) % len(STATUSES)]
                deleted = project_index == project_count - 1 and user_index % 5 == 0
                if deleted:
                    status = "completed"
                config = _design_config(
                    base_model=base_model,
                    device=device,
                    photos=photos,
                    file_size_mb=file_size_mb,
                    vertices=vertices,
                    color=color,
                    status=status,
                    index=user_index + project_index,
                )
                name = f"{base_model} {user.username} {project_index + 1:02d}"[:100]
                project = await _ensure_project(
                    db,
                    user=user,
                    name=name,
                    description=f"{base_model} scan captured on {device}. Seeded from DB for local web development.",
                    status=status,
                    config=config,
                    created_at=_now() - timedelta(days=user_index * 5 + project_index * 2),
                    deleted=deleted,
                )
                source_asset = await _ensure_asset(
                    db,
                    project=project,
                    user=user,
                    asset_type="source_model",
                    filename=f"{base_model.lower().replace(' ', '-')}.glb",
                    file_size_bytes=int(file_size_mb * 1024 * 1024),
                    mime_type="model/gltf-binary",
                    metadata=config["scan"],
                )
                await _ensure_asset(
                    db,
                    project=project,
                    user=user,
                    asset_type="reference_image",
                    filename=f"{base_model.lower().replace(' ', '-')}-reference.jpg",
                    file_size_bytes=int(file_size_mb * 1024 * 128),
                    mime_type="image/jpeg",
                    metadata={"view": "turntable", "photos_count": photos},
                )
                project.canonical_model_asset_id = source_asset.id
                all_projects.append((project, user, plan_key, project_index))

        for index, (project, user, plan_key, project_index) in enumerate(all_projects):
            plan = plan_map[plan_key]
            if project.status == "completed":
                job_status = "completed"
            elif project.status == "baking":
                # Bake jobs run on KusStudio Desktop (migration 028): waiting for / held by a desktop.
                job_status = "claimed" if index % 2 else "awaiting_client"
            elif project.status == "in_progress":
                job_status = "failed" if index % 3 == 0 else "cancelled"
            else:
                continue

            job = await _ensure_bake_job(
                db,
                project=project,
                status=job_status,
                priority=plan.bake_priority,
                index=index,
            )
            if job_status == "completed":
                formats = plan.allowed_export_formats or ["glb"]
                for fmt_index, fmt in enumerate(formats[:3]):
                    await _ensure_export(
                        db,
                        project=project,
                        job=job,
                        user=user,
                        fmt=fmt,
                        file_size_bytes=36_000_000 + index * 900_000 + fmt_index * 300_000,
                        index=fmt_index,
                    )
            await _ensure_audit(
                db,
                actor=admin,
                action=f"bake_job.{job_status}",
                target_type="bake_job",
                target_id=str(job.id),
                payload={"project_id": str(project.id), "seed": "demo"},
            )

        suspended_user = next((user for user, _ in users if user.status == "suspended"), None)
        if suspended_user:
            await _ensure_audit(
                db,
                actor=admin,
                action="user.ban",
                target_type="user",
                target_id=str(suspended_user.id),
                payload={"reason": "Demo suspended account seeded for admin filters."},
            )

        for user, _plan_key in users:
            await _sync_usage(db, user)

        await db.commit()

        counts = {
            "users": len(users),
            "projects": len(all_projects),
            "exports": (
                await db.execute(select(func.count(ExportRecord.id)))
            ).scalar_one(),
            "invoices": (
                await db.execute(select(func.count(Invoice.id)))
            ).scalar_one(),
            "audit_logs": (
                await db.execute(select(func.count(AuditLog.id)))
            ).scalar_one(),
        }
        print("Seeded demo data:", counts)


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
