import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.project_asset import ProjectAsset
from app.services import onboarding_service


def _make_dummy_user(user_id: uuid.UUID | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id or uuid.uuid4(),
        email="test@example.com",
        username="testuser",
        is_verified=True,
    )


def _make_dummy_subscription(max_projects: int | None = 3) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        plan=SimpleNamespace(
            max_projects=max_projects,
            tier="free",
        ),
    )


def test_get_default_model_bytes_reads_valid_glb() -> None:
    data = onboarding_service.get_default_model_bytes()
    assert len(data) > 100_000
    # GLB header magic is 'glTF' (0x46546C67)
    assert data[:4] == b"glTF"


@pytest.mark.asyncio
async def test_seed_onboarding_project_creates_isolated_resources() -> None:
    user = _make_dummy_user()
    subscription = _make_dummy_subscription(max_projects=3)

    added_objects: list[object] = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=added_objects.append)
    db.flush = AsyncMock()

    with (
        patch("app.repositories.subscription_repo.get_by_user", new=AsyncMock(return_value=subscription)),
        patch("app.repositories.project_repo.count_for_user", new=AsyncMock(return_value=0)),
        patch("app.services.quota_service.increment_projects", new=AsyncMock()) as mock_increment,
        patch("app.infrastructure.storage.upload_bytes") as mock_upload,
    ):
        project = await onboarding_service.seed_onboarding_project(db, user, subscription=subscription)

    assert project is not None
    assert project.user_id == user.id
    assert project.name == onboarding_service.DEMO_PROJECT_NAME
    assert project.status == "draft"
    assert project.canonical_model_asset_id is not None

    # Check the asset created
    assets = [obj for obj in added_objects if isinstance(obj, ProjectAsset)]
    assert len(assets) == 1
    asset = assets[0]

    assert asset.id == project.canonical_model_asset_id
    assert asset.user_id == user.id
    assert asset.project_id == project.id
    assert asset.asset_type == "source_model"
    assert asset.file_path == f"source_models/{project.id}/{asset.id}.glb"
    assert asset.mime_type == "model/gltf-binary"
    assert asset.status == "ready"
    assert asset.file_size_bytes > 0

    mock_upload.assert_called_once_with(
        f"source_models/{project.id}/{asset.id}.glb",
        onboarding_service.get_default_model_bytes(),
        "model/gltf-binary",
    )
    mock_increment.assert_called_once_with(db, user.id, subscription, 1)


@pytest.mark.asyncio
async def test_seed_onboarding_project_respects_quota_limit() -> None:
    user = _make_dummy_user()
    subscription = _make_dummy_subscription(max_projects=3)
    db = AsyncMock()
    db.add = MagicMock()

    # User already has 3 projects, which is the limit
    with (
        patch("app.repositories.subscription_repo.get_by_user", new=AsyncMock(return_value=subscription)),
        patch("app.repositories.project_repo.count_for_user", new=AsyncMock(return_value=3)),
        patch("app.services.quota_service.increment_projects", new=AsyncMock()) as mock_increment,
        patch("app.infrastructure.storage.upload_bytes") as mock_upload,
    ):
        result = await onboarding_service.seed_onboarding_project(db, user, subscription=subscription)

    assert result is None
    db.add.assert_not_called()
    mock_upload.assert_not_called()
    mock_increment.assert_not_called()


@pytest.mark.asyncio
async def test_seed_onboarding_project_storage_error_is_graceful() -> None:
    user = _make_dummy_user()
    subscription = _make_dummy_subscription(max_projects=3)
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    with (
        patch("app.repositories.subscription_repo.get_by_user", new=AsyncMock(return_value=subscription)),
        patch("app.repositories.project_repo.count_for_user", new=AsyncMock(return_value=0)),
        patch("app.services.quota_service.increment_projects", new=AsyncMock()),
        patch("app.infrastructure.storage.upload_bytes", side_effect=RuntimeError("Storage connection timeout")),
    ):
        project = await onboarding_service.seed_onboarding_project(db, user, subscription=subscription)

    # Should still succeed in database creation despite storage warning
    assert project is not None
    assert project.user_id == user.id


@pytest.mark.asyncio
async def test_ensure_onboarding_project_if_missing_skips_when_already_present() -> None:
    user = _make_dummy_user()
    db = AsyncMock()

    # Mock has_demo_project returning True
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute.return_value = mock_result

    with patch("app.services.onboarding_service.seed_onboarding_project") as mock_seed:
        result = await onboarding_service.ensure_onboarding_project_if_missing(db, user)

    assert result is None
    mock_seed.assert_not_called()

