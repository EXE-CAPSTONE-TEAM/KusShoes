import pytest

from app.exceptions import AssetUploadInvalid
from app.infrastructure.storage import ObjectMetadata
from app.services.asset_service import validate_uploaded_object


@pytest.mark.parametrize(
    ("content_type", "prefix"),
    [
        ("model/gltf-binary", b"glTF\x02\x00\x00\x00"),
        ("model/gltf+json", b'  {"asset":{}}'),
        ("image/png", b"\x89PNG\r\n\x1a\n"),
        ("image/jpeg", b"\xff\xd8\xff\xe0"),
        ("image/webp", b"RIFF\x00\x00\x00\x00WEBP"),
    ],
)
def test_validate_uploaded_object_accepts_registered_signatures(content_type, prefix):
    size = validate_uploaded_object(
        asset_type="source_model" if content_type.startswith("model/") else "reference_image",
        expected_content_type=content_type,
        metadata=ObjectMetadata(size_bytes=123, content_type=content_type),
        prefix=prefix,
        reported_size_bytes=123,
    )
    assert size == 123


def test_validate_uploaded_object_rejects_spoofed_content():
    with pytest.raises(AssetUploadInvalid):
        validate_uploaded_object(
            asset_type="source_model",
            expected_content_type="model/gltf-binary",
            metadata=ObjectMetadata(size_bytes=123, content_type="model/gltf-binary"),
            prefix=b"<script>alert(1)</script>",
            reported_size_bytes=123,
        )


def test_validate_uploaded_object_uses_storage_size():
    with pytest.raises(AssetUploadInvalid):
        validate_uploaded_object(
            asset_type="sticker",
            expected_content_type="image/png",
            metadata=ObjectMetadata(
                size_bytes=5 * 1024 * 1024 + 1,
                content_type="image/png",
            ),
            prefix=b"\x89PNG\r\n\x1a\n",
            reported_size_bytes=100,
        )
