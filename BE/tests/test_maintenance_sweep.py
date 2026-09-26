"""Tests for expired-claim sweep (spec §A.9, Ticket-02).

Acceptance criteria:
- Only `claimed` rows with `claim_expires_at < now - CLAIM_LEASE_SECONDS` become `failed`.
- Exactly the row's `issued_outputs` keys are deleted; project status reset.
- A row re-claimed between select and delete is untouched.
"""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.bake_job import BakeJob
from app.models.project import Project
from app.models.project_asset import ProjectAsset
from app.repositories import bake_job_repo
from app.services import maintenance_service
from app.workers.tasks.maintenance_tasks import _cleanup_stale_uploads
from tests.job_helpers import GLB_BYTES, ZIP_BYTES, FakeStorage


async def _create_project(
    db: AsyncSession, user_id: uuid.UUID, *, name: str = "Test Shoe", status: str = "in_progress"
) -> Project:
    project = Project(
        name=name,
        user_id=user_id,
        status=status,
    )
    db.add(project)
    await db.flush()
    return project


async def _create_job(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    status: str = "claimed",
    claim_expires_at: datetime | None = None,
    issued_outputs: list[dict] | None = None,
    queued_at: datetime | None = None,
) -> BakeJob:
    job = BakeJob(
        project_id=project_id,
        kind="bake",
        design_config_snapshot={"color": "blue"},
        status=status,
        claim_expires_at=claim_expires_at,
        issued_outputs=issued_outputs,
        queued_at=queued_at or datetime.now(UTC),
    )
    db.add(job)
    await db.flush()
    return job


@pytest.mark.asyncio
async def test_sweep_transitions_only_expired_claimed_rows(db, authenticated_user, monkeypatch):
    """Only claimed rows with claim_expires_at < now - CLAIM_LEASE_SECONDS become failed."""
    fake = FakeStorage().install(monkeypatch)
    now = datetime.now(UTC)
    lease = timedelta(seconds=settings.CLAIM_LEASE_SECONDS)
    delta = timedelta(seconds=120)

    # 1. Expired past lease grace window (claim_expires_at < now - CLAIM_LEASE_SECONDS)
    proj_expired = await _create_project(db, authenticated_user.id, name="Expired", status="baking")
    job_expired_id = uuid.uuid4()
    staging_expired = f"staging/{proj_expired.id}/{job_expired_id}/claim-1/model.glb"
    fake.objects[staging_expired] = GLB_BYTES
    job_expired = await _create_job(
        db,
        proj_expired.id,
        status="claimed",
        claim_expires_at=now - lease - delta,
        issued_outputs=[{"format": "glb", "file_path": staging_expired, "content_type": "model/gltf-binary"}],
    )

    # 2. Expired recently (within the 1-lease grace window)
    proj_recent = await _create_project(db, authenticated_user.id, name="Recent", status="baking")
    staging_recent = f"staging/{proj_recent.id}/job-2/claim-2/model.glb"
    fake.objects[staging_recent] = GLB_BYTES
    job_recent = await _create_job(
        db,
        proj_recent.id,
        status="claimed",
        claim_expires_at=now - delta,
        issued_outputs=[{"format": "glb", "file_path": staging_recent, "content_type": "model/gltf-binary"}],
    )

    # 3. Live claim (claim_expires_at in the future)
    proj_live = await _create_project(db, authenticated_user.id, name="Live", status="baking")
    staging_live = f"staging/{proj_live.id}/job-3/claim-3/model.glb"
    fake.objects[staging_live] = GLB_BYTES
    job_live = await _create_job(
        db,
        proj_live.id,
        status="claimed",
        claim_expires_at=now + lease,
        issued_outputs=[{"format": "glb", "file_path": staging_live, "content_type": "model/gltf-binary"}],
    )

    # 4. Awaiting client (must be left for supersession per spec §A.9)
    proj_awaiting = await _create_project(db, authenticated_user.id, name="Awaiting", status="baking")
    job_awaiting = await _create_job(
        db,
        proj_awaiting.id,
        status="awaiting_client",
        queued_at=now - lease - delta,
    )

    # 5. Terminal jobs (completed, failed, cancelled) with old expiry timestamps
    proj_completed = await _create_project(db, authenticated_user.id, name="Completed", status="completed")
    job_completed = await _create_job(
        db, proj_completed.id, status="completed", claim_expires_at=now - lease - delta
    )

    proj_failed = await _create_project(db, authenticated_user.id, name="Failed", status="in_progress")
    job_failed = await _create_job(
        db, proj_failed.id, status="failed", claim_expires_at=now - lease - delta
    )

    proj_cancelled = await _create_project(db, authenticated_user.id, name="Cancelled", status="in_progress")
    job_cancelled = await _create_job(
        db, proj_cancelled.id, status="cancelled", claim_expires_at=now - lease - delta
    )

    await db.commit()

    # Run the sweep task
    result = await _cleanup_stale_uploads(db)
    assert result["status"] == "completed"

    # Expired job was failed, staging deleted, project status reset
    await db.refresh(job_expired)
    assert job_expired.status == "failed"
    assert job_expired.error_message == "claim lease expired"
    assert job_expired.completed_at is not None
    assert staging_expired not in fake.objects
    assert staging_expired in fake.deleted

    await db.refresh(proj_expired)
    assert proj_expired.status == "in_progress"

    # Recent job (inside grace window) is untouched
    await db.refresh(job_recent)
    assert job_recent.status == "claimed"
    assert staging_recent in fake.objects
    assert staging_recent not in fake.deleted
    await db.refresh(proj_recent)
    assert proj_recent.status == "baking"

    # Live job is untouched
    await db.refresh(job_live)
    assert job_live.status == "claimed"
    assert staging_live in fake.objects
    await db.refresh(proj_live)
    assert proj_live.status == "baking"

    # Awaiting client job is untouched
    await db.refresh(job_awaiting)
    assert job_awaiting.status == "awaiting_client"
    await db.refresh(proj_awaiting)
    assert proj_awaiting.status == "baking"

    # Terminal jobs are untouched
    await db.refresh(job_completed)
    assert job_completed.status == "completed"
    await db.refresh(job_failed)
    assert job_failed.status == "failed"
    await db.refresh(job_cancelled)
    assert job_cancelled.status == "cancelled"


@pytest.mark.asyncio
async def test_sweep_deletes_exactly_issued_outputs_and_resets_project(db, authenticated_user, monkeypatch):
    """Exactly the row's issued_outputs keys are deleted; project status reset."""
    fake = FakeStorage().install(monkeypatch)
    now = datetime.now(UTC)
    lease = timedelta(seconds=settings.CLAIM_LEASE_SECONDS)
    delta = timedelta(seconds=60)

    project = await _create_project(db, authenticated_user.id, name="MultiOutput", status="baking")
    job_id = uuid.uuid4()
    claim_id = uuid.uuid4()

    # Job issued two outputs (GLB and OBJ zip)
    glb_key = f"staging/{project.id}/{job_id}/{claim_id}/export.glb"
    zip_key = f"staging/{project.id}/{job_id}/{claim_id}/export.zip"
    fake.objects[glb_key] = GLB_BYTES
    fake.objects[zip_key] = ZIP_BYTES

    # Other assets that belong to the project (must NOT be touched)
    canonical_model_key = f"models/{project.id}/source.glb"
    thumbnail_key = f"thumbnails/{project.id}/thumb.png"
    other_file_key = "models/other-project/file.glb"
    fake.objects[canonical_model_key] = GLB_BYTES
    fake.objects[thumbnail_key] = b"image-bytes"
    fake.objects[other_file_key] = GLB_BYTES

    job = await _create_job(
        db,
        project.id,
        status="claimed",
        claim_expires_at=now - lease - delta,
        issued_outputs=[
            {"format": "glb", "file_path": glb_key, "content_type": "model/gltf-binary"},
            {"format": "obj", "file_path": zip_key, "content_type": "application/zip"},
        ],
    )
    await db.commit()

    # Run sweep
    paths = await maintenance_service.sweep_expired_claims(db)
    assert set(paths) == {glb_key, zip_key}
    maintenance_service.delete_paths(paths)

    # Exactly issued_outputs deleted
    assert set(fake.deleted) == {glb_key, zip_key}
    assert glb_key not in fake.objects
    assert zip_key not in fake.objects

    # Other non-staging objects preserved
    assert canonical_model_key in fake.objects
    assert thumbnail_key in fake.objects
    assert other_file_key in fake.objects

    # Job failed and project status reset to in_progress
    await db.refresh(job)
    assert job.status == "failed"
    await db.refresh(project)
    assert project.status == "in_progress"


@pytest.mark.asyncio
async def test_sweep_leaves_reclaimed_row_untouched(db, authenticated_user, monkeypatch):
    """A row re-claimed between select and delete is untouched (conditional update)."""
    fake = FakeStorage().install(monkeypatch)
    now = datetime.now(UTC)
    lease = timedelta(seconds=settings.CLAIM_LEASE_SECONDS)
    delta = timedelta(seconds=60)

    # Project with a job that expired past the lease
    project = await _create_project(db, authenticated_user.id, name="ReclaimRace", status="baking")
    old_claim_id = uuid.uuid4()
    old_staging_key = f"staging/{project.id}/job-1/{old_claim_id}/old.glb"
    fake.objects[old_staging_key] = GLB_BYTES

    job = await _create_job(
        db,
        project.id,
        status="claimed",
        claim_expires_at=now - lease - delta,
        issued_outputs=[{"format": "glb", "file_path": old_staging_key, "content_type": "model/gltf-binary"}],
    )
    await db.commit()

    # Re-claim the job before the sweep executes (simulating concurrent re-claim)
    new_claim_id = uuid.uuid4()
    new_token_hash = "fake-sha256-hash"
    new_staging_key = f"staging/{project.id}/job-1/{new_claim_id}/new.glb"
    fake.objects[new_staging_key] = GLB_BYTES

    reclaimed = await bake_job_repo.claim(
        db,
        job.id,
        claim_id=new_claim_id,
        claim_token_hash=new_token_hash,
        lease_seconds=settings.CLAIM_LEASE_SECONDS,
        worker_id="desktop-worker-2",
    )
    assert reclaimed is not None
    reclaimed.issued_outputs = [
        {"format": "glb", "file_path": new_staging_key, "content_type": "model/gltf-binary"}
    ]
    await db.commit()

    # Now run the sweep with the original cutoff
    cutoff = now - lease
    swept_paths = await maintenance_service.sweep_expired_claims(db, before=cutoff)

    # Nothing swept because the row was re-claimed (claim_expires_at is in the future)
    assert swept_paths == []
    maintenance_service.delete_paths(swept_paths)

    # Re-claimed job is untouched: still claimed, new staging preserved
    await db.refresh(job)
    assert job.status == "claimed"
    assert job.claim_id == new_claim_id
    assert new_staging_key in fake.objects
    assert new_staging_key not in fake.deleted

    # Project status remains baking
    await db.refresh(project)
    assert project.status == "baking"


@pytest.mark.asyncio
async def test_celery_task_cleans_both_stale_uploads_and_expired_claims(
    db, authenticated_user, monkeypatch
):
    """cleanup_stale_uploads task deletes stale asset upload records and sweeps expired claims."""
    fake = FakeStorage().install(monkeypatch)
    now = datetime.now(UTC)
    lease = timedelta(seconds=settings.CLAIM_LEASE_SECONDS)
    delta = timedelta(seconds=120)

    project = await _create_project(db, authenticated_user.id, name="CeleryTask", status="baking")

    # 1. Stale uploading asset (> 1h old)
    stale_asset_path = f"assets/{project.id}/stale.glb"
    fake.objects[stale_asset_path] = GLB_BYTES
    stale_asset = ProjectAsset(
        project_id=project.id,
        user_id=authenticated_user.id,
        asset_type="sticker",
        file_path=stale_asset_path,
        file_size_bytes=len(GLB_BYTES),
        mime_type="model/gltf-binary",
        status="uploading",
        created_at=(now - timedelta(hours=2)).replace(tzinfo=None),
    )
    db.add(stale_asset)

    # 2. Expired claimed bake job
    staging_key = f"staging/{project.id}/job-celery/claim-celery/export.glb"
    fake.objects[staging_key] = GLB_BYTES
    job = await _create_job(
        db,
        project.id,
        status="claimed",
        claim_expires_at=now - lease - delta,
        issued_outputs=[{"format": "glb", "file_path": staging_key, "content_type": "model/gltf-binary"}],
    )
    await db.commit()

    # Call the cleanup task helper
    res = await _cleanup_stale_uploads(db)
    assert res["status"] == "completed"
    assert res["deleted"] == 2  # 1 stale asset + 1 staging key

    # Assert both storage files were removed
    assert stale_asset_path not in fake.objects
    assert staging_key not in fake.objects
    assert stale_asset_path in fake.deleted
    assert staging_key in fake.deleted

    # Assert DB state
    await db.refresh(job)
    assert job.status == "failed"
    await db.refresh(project)
    assert project.status == "in_progress"
    assert await db.get(ProjectAsset, stale_asset.id) is None


@pytest.mark.asyncio
async def test_sweep_does_not_overwrite_a_project_that_moved_on(db, authenticated_user, monkeypatch):
    """Only projects still `baking` are released; newer project state is left alone."""
    FakeStorage().install(monkeypatch)
    lease = timedelta(seconds=settings.CLAIM_LEASE_SECONDS)
    project = await _create_project(db, authenticated_user.id, name="MovedOn", status="completed")
    job = await _create_job(
        db,
        project.id,
        status="claimed",
        claim_expires_at=datetime.now(UTC) - lease - timedelta(seconds=60),
        issued_outputs=[],
    )
    await db.commit()

    await maintenance_service.sweep_expired_claims(db)

    await db.refresh(job)
    await db.refresh(project)
    assert job.status == "failed"
    assert project.status == "completed"
