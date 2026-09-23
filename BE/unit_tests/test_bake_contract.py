import uuid
from types import SimpleNamespace

import pytest

from app.services import bake_service


def test_normalise_formats_filters_unsupported_and_deduplicates():
    assert bake_service.normalise_formats(["GLB", "fbx", "glb", "obj"]) == [
        "glb",
        "obj",
    ]


def test_normalise_formats_rejects_plan_without_supported_output():
    with pytest.raises(ValueError, match="không hỗ trợ"):
        bake_service.normalise_formats(["fbx"])


def test_extract_referenced_asset_ids_deduplicates_camel_and_snake_case():
    first = uuid.uuid4()
    second = uuid.uuid4()
    text_render = uuid.uuid4()

    assert bake_service.extract_referenced_asset_ids(
        {
            "stickers": [
                {"assetId": str(first)},
                {"asset_id": str(first)},
                {"assetId": str(second)},
                {"source": "preset"},
            ],
            "texts": [
                {"renderAssetId": str(text_render)},
            ],
        }
    ) == [first, second, text_render]


@pytest.mark.asyncio
async def test_build_bake_payload_issues_claim_scoped_capabilities(monkeypatch):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    source_id = uuid.uuid4()
    decal_id = uuid.uuid4()

    project = SimpleNamespace(
        id=project_id,
        user_id=user_id,
        canonical_model_asset_id=source_id,
    )
    job = SimpleNamespace(
        id=job_id,
        source_asset_id=source_id,
        design_config_snapshot={"stickers": [{"assetId": str(decal_id)}]},
    )
    source = SimpleNamespace(
        id=source_id,
        project_id=project_id,
        user_id=user_id,
        asset_type="source_model",
        status="ready",
        mime_type="model/gltf-binary",
        file_size_bytes=1024,
        file_path=f"projects/{project_id}/source.glb",
    )
    decal = SimpleNamespace(
        id=decal_id,
        project_id=project_id,
        user_id=user_id,
        asset_type="sticker",
        status="ready",
        mime_type="image/png",
        file_size_bytes=128,
        file_path=f"projects/{project_id}/decal.png",
    )

    async def get_asset(_db, asset_id):
        return {source_id: source, decal_id: decal}.get(asset_id)

    monkeypatch.setattr(bake_service.project_asset_repo, "get_by_id", get_asset)
    monkeypatch.setattr(
        bake_service.storage,
        "generate_presigned_download_url",
        lambda path, ttl: f"https://storage.test/download/{path}?ttl={ttl}",
    )
    monkeypatch.setattr(
        bake_service.storage,
        "generate_presigned_upload_url",
        lambda path, content_type, ttl: (
            f"https://storage.test/upload/{path}?type={content_type}&ttl={ttl}"
        ),
    )

    claim_id = uuid.uuid4()
    payload, issued = await bake_service.build_bake_payload(
        object(),
        project=project,
        job=job,
        formats=["glb", "obj"],
        claim_id=claim_id,
        watermark={"required": True, "text": "KusShoes", "max_edge_px": 1080, "opacity_percent": 35},
    )

    assert payload["source_model"]["asset_id"] == str(source_id)
    assert payload["asset_downloads"][0]["asset_id"] == str(decal_id)
    assert payload["formats"] == ["glb", "obj"]
    # ADR-009: uploads land on per-claim staging keys, never on the final export keys.
    staging = f"staging/{project_id}/{job_id}/{claim_id}"
    assert [item["file_path"] for item in issued] == [
        f"{staging}/final_shoe.glb",
        f"{staging}/final_shoe.obj.zip",
    ]
    assert [item["file_path"] for item in payload["outputs"]] == [
        item["file_path"] for item in issued
    ]
    assert payload["outputs"][1]["content_type"] == "application/zip"
    # Every capability expires with the claim lease.
    lease = bake_service.settings.CLAIM_LEASE_SECONDS
    assert all(f"ttl={lease}" in item["upload_url"] for item in payload["outputs"])
    assert f"ttl={lease}" in payload["source_model"]["download_url"]
    assert payload["watermark"] == {"required": True, "text": "KusShoes", "opacity_percent": 35}


@pytest.mark.asyncio
async def test_build_bake_payload_rejects_cross_project_source(monkeypatch):
    source_id = uuid.uuid4()
    project = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        canonical_model_asset_id=source_id,
    )
    job = SimpleNamespace(
        id=uuid.uuid4(), source_asset_id=source_id, design_config_snapshot={"stickers": []}
    )
    source = SimpleNamespace(
        id=source_id,
        project_id=uuid.uuid4(),
        user_id=project.user_id,
        asset_type="source_model",
        status="ready",
        mime_type="model/gltf-binary",
        file_size_bytes=1024,
        file_path="source.glb",
    )

    async def get_asset(_db, _asset_id):
        return source

    monkeypatch.setattr(bake_service.project_asset_repo, "get_by_id", get_asset)

    with pytest.raises(ValueError, match="canonical"):
        await bake_service.build_bake_payload(
            object(),
            project=project,
            job=job,
            formats=["glb"],
            claim_id=uuid.uuid4(),
            watermark={"required": False, "text": "KusShoes", "opacity_percent": 35},
        )
