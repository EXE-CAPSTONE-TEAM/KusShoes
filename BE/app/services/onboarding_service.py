import logging
import pathlib
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure import storage
from app.models.project import Project
from app.models.project_asset import ProjectAsset
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import project_repo, subscription_repo
from app.services import quota_service

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "assets" / "models" / "3DModel.glb"
)
DEMO_PROJECT_NAME = "My sneaker"
DEMO_PROJECT_DESCRIPTION = (
    "Dự án mẫu có sẵn từ data/3DModel.glb để bạn trải nghiệm tùy biến trên KusShoes Studio."
)
DEFAULT_BASE_MODEL_NAME = "My sneaker"


def get_default_model_bytes() -> bytes:
    """Return the raw bytes of the bundled 3DModel.glb asset."""
    if not DEFAULT_MODEL_PATH.exists():
        raise FileNotFoundError(f"Bundled 3D demo model missing at {DEFAULT_MODEL_PATH}")
    return DEFAULT_MODEL_PATH.read_bytes()


def create_default_design_config(base_model_name: str = DEFAULT_BASE_MODEL_NAME) -> dict[str, Any]:
    """Create default clean design configuration for the demo project."""
    return {
        "baseModel": base_model_name,
        "baseColor": "#FFFFFF",
        "material": {"roughness": 0.8, "metallic": 0.1},
        "stickers": [],
        "texts": [],
        "camera": {},
        "metadata": {"seed": "onboarding_demo"},
    }


async def seed_onboarding_project(
    db: AsyncSession,
    user: User,
    *,
    subscription: Subscription | None = None,
) -> Project | None:
    """Safely seed the default 3DModel.glb project for a new user.

    Enforces strict tenant isolation and quota rules ('tránh vượt quyền'):
    - Project and Asset are strictly bound to user.id.
    - Model asset is stored under the tenant's isolated storage prefix:
      source_models/{project.id}/{asset.id}.glb
    - Deletion of this project will never delete shared templates or affect other tenants.
    - Quota is tracked via quota_service.
    """
    if subscription is None:
        subscription = await subscription_repo.get_by_user(db, user.id)

    max_projects = subscription.plan.max_projects if subscription and subscription.plan else None
    live_count = await project_repo.count_for_user(db, user.id)
    if max_projects is not None and live_count >= max_projects:
        logger.info(
            "User %s has reached max_projects (%s), skipping onboarding demo project",
            user.id,
            max_projects,
        )
        return None

    try:
        model_bytes = get_default_model_bytes()
    except Exception as exc:
        logger.warning("Could not read default 3D demo model: %s", exc)
        return None

    # 1. Create project with isolated ownership
    project = Project(
        user_id=user.id,
        name=DEMO_PROJECT_NAME,
        description=DEMO_PROJECT_DESCRIPTION,
        status="draft",
        design_config=create_default_design_config(),
    )
    db.add(project)
    await db.flush()

    # 2. Create isolated source model asset
    asset_id = uuid.uuid4()
    file_path = f"source_models/{project.id}/{asset_id}.glb"
    asset = ProjectAsset(
        id=asset_id,
        project_id=project.id,
        user_id=user.id,
        asset_type="source_model",
        original_filename="3DModel.glb",
        file_path=file_path,
        file_size_bytes=len(model_bytes),
        mime_type="model/gltf-binary",
        status="ready",
        metadata_={"is_demo": True, "base_model": DEFAULT_BASE_MODEL_NAME},
    )
    db.add(asset)
    await db.flush()

    # 3. Associate canonical model
    project.canonical_model_asset_id = asset.id

    # 4. Upload model file to isolated tenant storage key
    try:
        storage.upload_bytes(file_path, model_bytes, "model/gltf-binary")
    except Exception as exc:
        logger.warning(
            "Storage upload failed for onboarding demo project %s: %s", project.id, exc
        )

    # 5. Track project quota accurately
    await quota_service.increment_projects(db, user.id, subscription, 1)
    await db.flush()

    logger.info(
        "Successfully provisioned onboarding demo project %s for user %s",
        project.id,
        user.id,
    )
    return project


async def has_demo_project(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Check if the user has ever had a demo project named DEMO_PROJECT_NAME (including soft-deleted)."""
    result = await db.execute(
        select(Project.id).where(
            Project.user_id == user_id,
            Project.name == DEMO_PROJECT_NAME,
        )
    )
    return result.scalar_one_or_none() is not None


async def ensure_onboarding_project_if_missing(
    db: AsyncSession,
    user: User,
) -> Project | None:
    """Ensure user has 'My sneaker' demo project if not already present."""
    if await has_demo_project(db, user.id):
        return None
    return await seed_onboarding_project(db, user)


async def seed_all_existing_users(db: AsyncSession) -> int:
    """Backfill 'My sneaker' demo project for all existing active users who don't have it."""
    users = (
        await db.execute(
            select(User).where(User.deleted_at.is_(None))
        )
    ).scalars().all()

    count = 0
    for user in users:
        if not await has_demo_project(db, user.id):
            proj = await seed_onboarding_project(db, user)
            if proj:
                count += 1
    await db.commit()
    logger.info("Backfilled demo project for %d existing users", count)
    return count
