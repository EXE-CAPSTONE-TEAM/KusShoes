"""MoMo (e-wallet) payment gateway client.

Docs: https://developers.momo.vn/v3/docs/payment/api/wallet/onetime. MoMo signs
a fixed, alphabetically-ordered subset of fields per operation with
HMAC-SHA256, joined as ``key=value`` pairs with ``&``.
"""
import hashlib
import hmac
import uuid

import httpx
from loguru import logger

from app.config import settings

_CREATE_SIGNATURE_FIELDS = [
    "accessKey", "amount", "extraData", "ipnUrl", "orderId",
    "orderInfo", "partnerCode", "redirectUrl", "requestId", "requestType",
]
_IPN_SIGNATURE_FIELDS = [
    "accessKey", "amount", "extraData", "message", "orderId", "orderInfo",
    "orderType", "partnerCode", "payType", "requestId", "responseTime",
    "resultCode", "transId",
]


class MoMoError(Exception):
    pass


class MoMoSignatureError(Exception):
    pass


def _sign(fields: list[str], data: dict, secret_key: str) -> str:
    raw = "&".join(f"{field}={data.get(field, '')}" for field in fields)
    return hmac.new(secret_key.encode(), raw.encode(), hashlib.sha256).hexdigest()


async def create_payment(
    *, order_id: str, amount: int, order_info: str, redirect_url: str, ipn_url: str
) -> tuple[str, str | None]:
    """Returns (pay_url, deeplink)."""
    request_id = str(uuid.uuid4())
    signature_data = {
        "accessKey": settings.MOMO_ACCESS_KEY,
        "amount": amount,
        "extraData": "",
        "ipnUrl": ipn_url,
        "orderId": order_id,
        "orderInfo": order_info,
        "partnerCode": settings.MOMO_PARTNER_CODE,
        "redirectUrl": redirect_url,
        "requestId": request_id,
        "requestType": "captureWallet",
    }
    body = {
        "partnerCode": settings.MOMO_PARTNER_CODE,
        "requestId": request_id,
        "amount": amount,
        "orderId": order_id,
        "orderInfo": order_info,
        "redirectUrl": redirect_url,
        "ipnUrl": ipn_url,
        "lang": "vi",
        "requestType": "captureWallet",
        "extraData": "",
        "signature": _sign(_CREATE_SIGNATURE_FIELDS, signature_data, settings.MOMO_SECRET_KEY),
    }
    async with httpx.AsyncClient(timeout=15) as http:
        response = await http.post(settings.MOMO_ENDPOINT, json=body)
    payload = response.json()
    if payload.get("resultCode") != 0:
        logger.error(f"MoMo create_payment failed: {payload}")
        raise MoMoError(payload.get("message", "MoMo request failed"))
    return payload["payUrl"], payload.get("deeplink")


def verify_ipn_signature(payload: dict) -> None:
    """Raises MoMoSignatureError if the IPN signature doesn't match."""
    signature = payload.get("signature")
    expected = _sign(_IPN_SIGNATURE_FIELDS, {**payload, "accessKey": settings.MOMO_ACCESS_KEY}, settings.MOMO_SECRET_KEY)
    if not signature or not hmac.compare_digest(expected, signature):
        raise MoMoSignatureError("MoMo IPN signature mismatch")
