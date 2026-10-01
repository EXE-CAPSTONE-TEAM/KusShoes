from fastapi import Request
from fastapi.responses import Response

from app.config import settings

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def attachment_response(data: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def get_client_ip(request: Request) -> str:
    """The client address as seen by the outermost proxy we run.

    Each trusted proxy appends the peer it saw to X-Forwarded-For, so only the last
    TRUSTED_PROXY_HOPS entries are ours; anything left of them is whatever the client
    sent and must never key a rate limit. With no proxy (hops = 0) the socket peer is
    the client.
    """
    hops = settings.TRUSTED_PROXY_HOPS
    forwarded = request.headers.get("x-forwarded-for")
    if hops > 0 and forwarded:
        chain = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        if chain:
            return chain[-hops] if len(chain) >= hops else chain[0]
    return request.client.host if request.client else "unknown"
