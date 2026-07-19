import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.exceptions import DesignRevisionConflict
from app.infrastructure.storage import ObjectDownload, iter_object_chunks
from app.schemas.auth import EditorSessionResponse
from app.schemas.editor import MAX_EDITOR_CONFIG_BYTES, EditorDesignConfig
from app.services.editor_service import (
    _design_response,
    _job_response,
    _model_asset_response,
    _permissions,
)


def _valid_config(asset_id: uuid.UUID) -> dict:
    return {
        "modelAssetId": str(asset_id),
        "baseColor": "#FA531C",
        "material": {"roughness": 0.7, "metallic": 0.1},
        "stickers": [],
        "texts": [],
        "camera": {},
        "metadata": {},
    }


def test_editor_design_config_serializes_frontend_aliases() -> None:
    asset_id = uuid.uuid4()
    config = EditorDesignConfig.model_validate(_valid_config(asset_id))

    payload = config.model_dump(mode="json", by_alias=True)

    assert payload["modelAssetId"] == str(asset_id)
    assert payload["baseColor"] == "#FA531C"


def test_editor_design_config_rejects_excess_layers() -> None:
    payload = _valid_config(uuid.uuid4())
    payload["stickers"] = [{} for _ in range(51)]

    with pytest.raises(ValidationError):
        EditorDesignConfig.model_validate(payload)


def test_editor_design_config_rejects_oversized_payload() -> None:
    payload = _valid_config(uuid.uuid4())
    payload["metadata"] = {"payload": "x" * MAX_EDITOR_CONFIG_BYTES}

    with pytest.raises(ValidationError, match="2 MiB"):
        EditorDesignConfig.model_validate(payload)


def test_stale_bake_artifact_is_not_exposed_as_current_preview() -> None:
    now = datetime.now(UTC)
    user_id = uuid.uuid4()
    project_id = uuid.uuid4()
    asset_id = uuid.uuid4()
    current_config = _valid_config(asset_id)
    project = SimpleNamespace(
        id=project_id,
        user_id=user_id,
        name="Current design",
        design_config=current_config,
        current_design_revision=1,
        created_at=now,
        updated_at=now,
    )
    asset = SimpleNamespace(id=asset_id)
    job = SimpleNamespace(
        id=uuid.uuid4(),
        status="completed",
        design_config_snapshot={**current_config, "baseColor": "#000000"},
        error_message=None,
    )
    export = SimpleNamespace(
        id=uuid.uuid4(),
        bake_job_id=job.id,
        format="glb",
    )

    response = _design_response(project, asset, job, [export])

    assert response.preview_status == "none"
    assert response.preview_glb_url is None


def test_matching_bake_artifact_is_exposed_as_preview() -> None:
    now = datetime.now(UTC)
    project_id = uuid.uuid4()
    asset_id = uuid.uuid4()
    config = _valid_config(asset_id)
    project = SimpleNamespace(
        id=project_id,
        user_id=uuid.uuid4(),
        name="Ready design",
        design_config=config,
        current_design_revision=1,
        created_at=now,
        updated_at=now,
    )
    asset = SimpleNamespace(id=asset_id)
    job = SimpleNamespace(
        id=uuid.uuid4(),
        status="completed",
        design_config_snapshot=dict(config),
        error_message=None,
    )
    export = SimpleNamespace(id=uuid.uuid4(), bake_job_id=job.id, format="glb")

    response = _design_response(project, asset, job, [export])

    assert response.preview_status == "ready"
    assert response.preview_glb_url == f"/api/v1/editor/exports/{export.id}/content"


def test_non_glb_canonical_asset_is_not_marked_ready() -> None:
    now = datetime.now(UTC)
    asset = SimpleNamespace(
        id=uuid.uuid4(),
        status="ready",
        mime_type="model/gltf+json",
        metadata_={},
        created_at=now,
    )
    project = SimpleNamespace(id=uuid.uuid4())

    response = _model_asset_response(project, asset)

    assert response.status == "failed"
    assert "error" in response.quality_report


def test_cancelled_job_maps_to_frontend_failed_terminal_state() -> None:
    now = datetime.now(UTC)
    project_id = uuid.uuid4()
    job = SimpleNamespace(
        id=uuid.uuid4(),
        project_id=project_id,
        status="cancelled",
        error_message=None,
        queued_at=now,
        started_at=None,
        completed_at=now,
    )

    response = _job_response(job)

    assert response.status == "failed"
    assert response.progress == 100


def test_design_revision_conflict_carries_current_state() -> None:
    now = datetime.now(UTC)
    project = SimpleNamespace(
        current_design_revision=3,
        design_config={"color": "red"},
        updated_at=now,
    )

    error = DesignRevisionConflict(project)

    assert error.status_code == 409
    assert error.code == "DESIGN_REVISION_CONFLICT"
    assert error.extra == {
        "current_revision": 3,
        "current_design_config": {"color": "red"},
        "current_updated_at": now.isoformat(),
    }


def test_permissions_are_derived_from_editor_scopes() -> None:
    session = EditorSessionResponse(
        user_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        scopes=["editor:read"],
        expires_at=2_000_000_000,
    )

    permissions = _permissions(session)

    assert permissions.can_edit is False
    assert permissions.can_bake is False
    assert permissions.can_export is True


def test_streaming_download_enforces_content_length_and_closes_body() -> None:
    class Body:
        def __init__(self) -> None:
            self.payload = bytearray(b"glTFpayload")
            self.closed = False

        def read(self, size: int) -> bytes:
            chunk = bytes(self.payload[:size])
            del self.payload[:size]
            return chunk

        def close(self) -> None:
            self.closed = True

    body = Body()
    download = ObjectDownload(body=body, size_bytes=11, content_type="model/gltf-binary")

    assert b"".join(iter_object_chunks(download, chunk_size=64 * 1024)) == b"glTFpayload"
    assert body.closed is True
