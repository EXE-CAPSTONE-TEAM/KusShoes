from polar_sdk import Polar
from polar_sdk.webhooks import WebhookUnknownTypeError, WebhookVerificationError, validate_event

from app.config import settings

__all__ = [
    "WebhookUnknownTypeError",
    "WebhookVerificationError",
    "create_checkout",
    "verify_webhook_event",
    "get_customer_by_external_id",
    "create_customer_portal_session",
    "cancel_subscription",
    "update_subscription_product",
]


def _get_client() -> Polar:
    return Polar(access_token=settings.POLAR_ACCESS_TOKEN, server=settings.POLAR_SERVER)


async def create_checkout(
    *, product_id: str, external_customer_id: str, metadata: dict
) -> tuple[str, str]:
    """Returns (checkout_id, checkout_url)."""
    async with _get_client() as polar:
        result = await polar.checkouts.create(
            request={
                "products": [product_id],
                "external_customer_id": external_customer_id,
                "success_url": settings.POLAR_SUCCESS_URL,
                "metadata": metadata,
            }
        )
    return result.id, result.url


def verify_webhook_event(*, raw_body: bytes, headers: dict):
    """Raises WebhookVerificationError (bad signature) or WebhookUnknownTypeError (unknown event type)."""
    return validate_event(payload=raw_body, headers=headers, secret=settings.POLAR_WEBHOOK_SECRET)


async def get_customer_by_external_id(external_id: str):
    async with _get_client() as polar:
        return await polar.customers.get_external(external_id=external_id)


async def create_customer_portal_session(customer_id: str) -> str:
    """Session tokens are short-lived — always generate a fresh one, never cache the URL."""
    async with _get_client() as polar:
        result = await polar.customer_sessions.create(request={"customer_id": customer_id})
    return result.customer_portal_url


async def cancel_subscription(polar_subscription_id: str, *, immediate: bool) -> None:
    async with _get_client() as polar:
        if immediate:
            await polar.subscriptions.revoke(id=polar_subscription_id)
        else:
            await polar.subscriptions.update(
                id=polar_subscription_id, request={"cancel_at_period_end": True}
            )


async def update_subscription_product(polar_subscription_id: str, new_product_id: str) -> None:
    async with _get_client() as polar:
        await polar.subscriptions.update(
            id=polar_subscription_id, request={"product_id": new_product_id}
        )


async def create_refund(*, order_id: str, amount_vnd: int, comment: str | None = None) -> str:
    """Returns the Polar refund id. VND không có minor unit — amount pass-through."""
    async with _get_client() as polar:
        result = await polar.refunds.create(
            request={
                "order_id": order_id,
                "reason": "customer_request",
                "amount": amount_vnd,
                "comment": comment,
            }
        )
    return result.id
