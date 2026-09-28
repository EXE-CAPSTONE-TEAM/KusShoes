"""Run the KusShoes API in its own uvicorn process for the export-path benchmark.

Storage is replaced in-process: on prod the bucket is Cloudflare R2 (off the VM), so the API's own
work per export is HEAD + 512-byte ranged GET + CopyObject *requests*; the bytes never pass through
the API. Every staged object "exists" with OUTPUT_BYTES and the right magic prefix.
"""
import os
import sys

sys.path.insert(0, os.environ["BE_DIR"])
os.chdir(os.environ["BE_DIR"])

from app.infrastructure import storage  # noqa: E402

OUTPUT_BYTES = int(os.environ.get("OUTPUT_BYTES", str(8 * 1024 * 1024)))


def get_object_metadata(file_path):
    return storage.ObjectMetadata(size_bytes=OUTPUT_BYTES, content_type="application/octet-stream")


def read_object_prefix(file_path, length=512):
    if file_path.endswith(".glb"):
        return b"glTF" + b"\x02\x00\x00\x00" + b"\x00" * 64
    if file_path.endswith(".zip"):
        return b"PK\x03\x04" + b"\x00" * 64
    return b"o shoe\n"


storage.get_object_metadata = get_object_metadata
storage.read_object_prefix = read_object_prefix
storage.copy_object = lambda source, destination: None
storage.delete_files = lambda paths: None
storage.delete_file = lambda path: None
storage.generate_presigned_upload_url = lambda path, *a, **k: f"https://r2.invalid/put/{path}"
storage.generate_presigned_download_url = lambda path, *a, **k: f"https://r2.invalid/get/{path}"

import uvicorn  # noqa: E402

from app.main import app  # noqa: E402

# Prod runs a single uvicorn worker (BE/Dockerfile CMD), so does the benchmark.
uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BENCH_PORT", "8765")), log_level="warning")
