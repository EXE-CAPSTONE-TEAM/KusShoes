"""BR-65 Free-tier watermark policy and the render preview-image pipeline.

- BR-65 (SRS_v2.2.txt:1910): renders of a Free account always carry a watermark.
- BR-67 (SRS_v2.2.txt:1922): Free only downloads a watermarked PNG render, long edge capped by
  ``settings.WATERMARK_FREE_MAX_EDGE_PX``.
- Plan table row "Watermark trên render" (SRS_v2.2.txt:960) and "Ảnh PNG có watermark"
  (SRS_v2.2.txt:949).

The policy is derived from ``Subscription.tier`` only (TASK_PACK XR-2): no plan column is read or
added. Enforcement points: the bake worker payload (``bake_service``), ``export_records``
(``is_watermarked``) and ``GET /projects/{id}/preview-image`` (``render_preview``).
"""

import uuid
from typing import TypedDict

from PIL import UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import RenderImageUnavailable
from app.infrastructure import storage
from app.models.subscription import Subscription
from app.repositories import subscription_repo
from app.schemas.data_transfer import WatermarkPolicyResponse
from app.services.project_access import require_owner
from app.utils.watermark import stamp

PNG_MEDIA_TYPE = "image/png"


class WatermarkPolicy(TypedDict):
    required: bool
    text: str
    max_edge_px: int
    opacity_percent: int


def policy_for(subscription: Subscription | None) -> WatermarkPolicy:
    """A missing subscription or the Free tier must be watermarked (BR-65)."""
    return {
        "required": subscription is None or subscription.is_free,
        "text": settings.WATERMARK_TEXT,
        "max_edge_px": settings.WATERMARK_FREE_MAX_EDGE_PX,
        "opacity_percent": settings.WATERMARK_OPACITY_PERCENT,
    }


async def get_project_policy(
    db: AsyncSession, user, project_id: uuid.UUID
) -> WatermarkPolicyResponse:
    project = await require_owner(db, project_id, user)
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    return WatermarkPolicyResponse(**policy_for(subscription))


async def render_preview(db: AsyncSession, user, project_id: uuid.UUID) -> tuple[bytes, str]:
    """Return ``(body, media_type)`` for the project's render image.

    Free owners always receive a stamped, downscaled PNG; paid owners receive the stored
    object unchanged.
    """
    project = await require_owner(db, project_id, user)
    if not project.thumbnail_path:
        raise RenderImageUnavailable()
    subscription = await subscription_repo.get_by_user(db, project.user_id)
    policy = policy_for(subscription)

    try:
        download = storage.open_object_download(project.thumbnail_path)
    except storage.ObjectNotFoundError as exc:
        raise RenderImageUnavailable() from exc
    body = b"".join(storage.iter_object_chunks(download))

    if not policy["required"]:
        return body, download.content_type
    try:
        stamped = stamp(
            body,
            text=policy["text"],
            max_edge_px=policy["max_edge_px"],
            opacity_percent=policy["opacity_percent"],
        )
    except UnidentifiedImageError as exc:
        # The stored render is not a decodable image: there is nothing safe to hand out.
        raise RenderImageUnavailable() from exc
    return stamped, PNG_MEDIA_TYPE
