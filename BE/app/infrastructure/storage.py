from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings


@dataclass(frozen=True)
class ObjectMetadata:
    size_bytes: int
    content_type: str
    etag: str | None = None


class ObjectNotFoundError(FileNotFoundError):
    pass


@dataclass(frozen=True)
class ObjectDownload:
    body: Any
    size_bytes: int
    content_type: str
    etag: str | None = None


def _is_not_found(exc: ClientError) -> bool:
    code = str(exc.response.get("Error", {}).get("Code", ""))
    return code in {"404", "NoSuchKey", "NotFound"}


def _get_client():
    # SigV4 + path-style: tương thích cả MinIO (local) lẫn Cloudflare R2 (production).
    # R2 yêu cầu region "auto" — cấu hình qua STORAGE_REGION.
    return boto3.client(
        "s3",
        endpoint_url=settings.STORAGE_ENDPOINT,
        aws_access_key_id=settings.STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.STORAGE_SECRET_KEY,
        region_name=settings.STORAGE_REGION,
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def generate_presigned_upload_url(file_path: str, content_type: str, ttl: int = 900) -> str:
    client = _get_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.STORAGE_BUCKET,
            "Key": file_path,
            "ContentType": content_type,
        },
        ExpiresIn=ttl,
    )


def generate_presigned_download_url(file_path: str, ttl: int = 3600) -> str:
    client = _get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.STORAGE_BUCKET, "Key": file_path},
        ExpiresIn=ttl,
    )


def health_check() -> None:
    """Raises on failure — dùng cho admin system health."""
    client = _get_client()
    client.head_bucket(Bucket=settings.STORAGE_BUCKET)


def get_object_metadata(file_path: str) -> ObjectMetadata:
    try:
        response = _get_client().head_object(Bucket=settings.STORAGE_BUCKET, Key=file_path)
    except ClientError as exc:
        if _is_not_found(exc):
            raise ObjectNotFoundError(file_path) from exc
        raise
    return ObjectMetadata(
        size_bytes=int(response["ContentLength"]),
        content_type=str(response.get("ContentType") or "application/octet-stream").lower(),
        etag=str(response["ETag"]).strip('"') if response.get("ETag") else None,
    )


def read_object_prefix(file_path: str, length: int = 512) -> bytes:
    if length < 1 or length > 4096:
        raise ValueError("Object prefix length must be between 1 and 4096 bytes")
    try:
        response = _get_client().get_object(
            Bucket=settings.STORAGE_BUCKET,
            Key=file_path,
            Range=f"bytes=0-{length - 1}",
        )
    except ClientError as exc:
        if _is_not_found(exc):
            raise ObjectNotFoundError(file_path) from exc
        raise
    body = response["Body"]
    try:
        return bytes(body.read(length))
    finally:
        body.close()


def open_object_download(file_path: str) -> ObjectDownload:
    try:
        response = _get_client().get_object(
            Bucket=settings.STORAGE_BUCKET,
            Key=file_path,
        )
    except ClientError as exc:
        if _is_not_found(exc):
            raise ObjectNotFoundError(file_path) from exc
        raise
    return ObjectDownload(
        body=response["Body"],
        size_bytes=int(response["ContentLength"]),
        content_type=str(response.get("ContentType") or "application/octet-stream").lower(),
        etag=str(response["ETag"]).strip('"') if response.get("ETag") else None,
    )


def iter_object_chunks(
    download: ObjectDownload,
    chunk_size: int = 1024 * 1024,
) -> Iterator[bytes]:
    if chunk_size < 64 * 1024 or chunk_size > 8 * 1024 * 1024:
        raise ValueError("Object download chunk size must be between 64 KiB and 8 MiB")
    remaining = download.size_bytes
    try:
        while remaining > 0:
            chunk = download.body.read(min(chunk_size, remaining))
            if not chunk:
                raise OSError("Storage object ended before Content-Length bytes were read")
            payload = bytes(chunk)
            remaining -= len(payload)
            yield payload
    finally:
        download.body.close()


def file_exists(file_path: str) -> bool:
    try:
        get_object_metadata(file_path)
        return True
    except ObjectNotFoundError:
        return False


def delete_file(file_path: str) -> None:
    _get_client().delete_object(Bucket=settings.STORAGE_BUCKET, Key=file_path)
