from fastapi import Request
from fastapi.responses import Response

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def attachment_response(data: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def get_client_ip(request: Request) -> str:
    """Extract real client IP address, accounting for reverse proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    return request.client.host if request.client else "unknown"
