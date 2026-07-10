import boto3
from botocore.exceptions import ClientError

from app.config import settings


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.STORAGE_ENDPOINT,
        aws_access_key_id=settings.STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.STORAGE_SECRET_KEY,
        region_name="us-east-1",
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


def open_download_stream(file_path: str):
    client = _get_client()
    try:
        response = client.get_object(Bucket=settings.STORAGE_BUCKET, Key=file_path)
    except ClientError as exc:
        raise FileNotFoundError(file_path) from exc

    body = response["Body"]

    def chunks():
        try:
            while True:
                chunk = body.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    return chunks(), response.get("ContentType") or "application/octet-stream"


def health_check() -> None:
    """Raises on failure — dùng cho admin system health."""
    client = _get_client()
    client.head_bucket(Bucket=settings.STORAGE_BUCKET)


def file_exists(file_path: str) -> bool:
    try:
        _get_client().head_object(Bucket=settings.STORAGE_BUCKET, Key=file_path)
        return True
    except ClientError:
        return False


def delete_file(file_path: str) -> None:
    _get_client().delete_object(Bucket=settings.STORAGE_BUCKET, Key=file_path)
