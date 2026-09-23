"""Shared helpers for tests that create client-executed jobs (spec §A).

Bake requires a `ready` canonical GLB (spec §B.4), and the job protocol verifies uploads in
object storage; `FakeStorage` stands in for R2 so tests assert on storage effects directly.
"""
import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure import storage
from app.models.project_asset import ProjectAsset
from app.repositories import project_repo

GLB_BYTES = b"glTF" + b"\x02\x00\x00\x00" + b"\x00" * 64
ZIP_BYTES = b"PK\x03\x04" + b"\x00" * 64


async def attach_ready_model(
    db: AsyncSession,
    project_id: uuid.UUID | str,
    user_id: uuid.UUID,
    *,
    status: str = "ready",
) -> ProjectAsset:
    """Give a project a canonical source model (default `ready`, or e.g. `raw`)."""
    project_uuid = uuid.UUID(str(project_id))
    asset = ProjectAsset(
        project_id=project_uuid,
        user_id=user_id,
        asset_type="source_model",
        file_path=f"models/{project_uuid}/{uuid.uuid4()}.glb",
        file_size_bytes=len(GLB_BYTES),
        mime_type="model/gltf-binary",
        status=status,
    )
    db.add(asset)
    await db.flush()
    project = await project_repo.get_by_id(db, project_uuid)
    assert project is not None
    await project_repo.set_canonical_asset(db, project, asset.id)
    await db.commit()
    return asset


@dataclass
class FakeStorage:
    """In-memory stand-in for the storage functions the job protocol calls."""

    objects: dict[str, bytes] = field(default_factory=dict)
    copies: list[tuple[str, str]] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)

    def install(self, monkeypatch) -> "FakeStorage":
        monkeypatch.setattr(storage, "get_object_metadata", self.get_object_metadata)
        monkeypatch.setattr(storage, "read_object_prefix", self.read_object_prefix)
        monkeypatch.setattr(storage, "copy_object", self.copy_object)
        monkeypatch.setattr(storage, "delete_files", self.delete_files)
        monkeypatch.setattr(
            storage, "generate_presigned_upload_url", lambda path, *_a, **_k: f"https://r2/put/{path}"
        )
        monkeypatch.setattr(
            storage, "generate_presigned_download_url", lambda path, *_a, **_k: f"https://r2/get/{path}"
        )
        return self

    def get_object_metadata(self, file_path: str) -> storage.ObjectMetadata:
        if file_path not in self.objects:
            raise storage.ObjectNotFoundError(file_path)
        return storage.ObjectMetadata(
            size_bytes=len(self.objects[file_path]), content_type="application/octet-stream"
        )

    def read_object_prefix(self, file_path: str, length: int = 512) -> bytes:
        return self.objects[file_path][:length]

    def copy_object(self, source: str, destination: str) -> None:
        if source not in self.objects:
            raise storage.ObjectNotFoundError(source)
        self.objects[destination] = self.objects[source]
        self.copies.append((source, destination))

    def delete_files(self, file_paths: list[str]) -> None:
        for path in file_paths:
            self.objects.pop(path, None)
            self.deleted.append(path)
