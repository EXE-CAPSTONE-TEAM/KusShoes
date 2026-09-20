"""PayOS (VietQR) payment gateway client.

Docs: https://payos.vn/docs/api/. PayOS signs every payload with an HMAC-SHA256
checksum computed over the request/response body's top-level scalar fields,
sorted alphabetically by key and joined as ``key=value`` pairs with ``&``.
"""
import hashlib
import hmac

import httpx
from loguru import logger

from app.config import settings


class PayOSError(Exception):
    pass


class PayOSSignatureError(Exception):
    pass


def _canonical_query_string(data: dict) -> str:
    parts = []
    for key in sorted(data.keys()):
        value = data[key]
        parts.append(f"{key}={'' if value is None else value}")
    return "&".join(parts)


def _sign(data: dict, checksum_key: str) -> str:
    raw = _canonical_query_string(data)
    return hmac.new(checksum_key.encode(), raw.encode(), hashlib.sha256).hexdigest()


async def create_payment_link(
    *, order_code: int, amount: int, description: str, return_url: str, cancel_url: str
) -> tuple[str, str]:
    """Returns (checkout_url, payment_link_id)."""
    signature_payload = {
        "amount": amount,
        "cancelUrl": cancel_url,
        "description": description,
        "orderCode": order_code,
        "returnUrl": return_url,
    }
    body = {
        **signature_payload,
        "signature": _sign(signature_payload, settings.PAYOS_CHECKSUM_KEY),
    }
    headers = {
        "x-client-id": settings.PAYOS_CLIENT_ID,
        "x-api-key": settings.PAYOS_API_KEY,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(base_url=settings.PAYOS_BASE_URL, timeout=15) as http:
        response = await http.post("/v2/payment-requests", json=body, headers=headers)
    payload = response.json()
    if response.status_code != 200 or payload.get("code") != "00":
        logger.error(f"PayOS create_payment_link failed: {payload}")
        raise PayOSError(payload.get("desc", "PayOS request failed"))
    data = payload["data"]
    return data["checkoutUrl"], data["paymentLinkId"]


async def cancel_payment_link(*, order_code: int, reason: str) -> None:
    headers = {
        "x-client-id": settings.PAYOS_CLIENT_ID,
        "x-api-key": settings.PAYOS_API_KEY,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(base_url=settings.PAYOS_BASE_URL, timeout=15) as http:
        response = await http.post(
            f"/v2/payment-requests/{order_code}/cancel",
            json={"cancellationReason": reason},
            headers=headers,
        )
    payload = response.json()
    if response.status_code != 200 or payload.get("code") != "00":
        logger.error(f"PayOS cancel_payment_link failed: {payload}")
        raise PayOSError(payload.get("desc", "PayOS cancel failed"))


def verify_webhook_signature(payload: dict) -> dict:
    """Returns the verified `data` object, or raises PayOSSignatureError."""
    data = payload.get("data")
    signature = payload.get("signature")
    if not isinstance(data, dict) or not signature:
        raise PayOSSignatureError("Missing data/signature in PayOS webhook payload")
    expected = _sign(data, settings.PAYOS_CHECKSUM_KEY)
    if not hmac.compare_digest(expected, signature):
        raise PayOSSignatureError("PayOS webhook signature mismatch")
    return data
