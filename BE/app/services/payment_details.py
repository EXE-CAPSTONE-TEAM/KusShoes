from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from loguru import logger

VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def mask_account(number: str | None) -> str | None:
    """Masks a bank account number, keeping only the last 4 digits (e.g. ••••1234)."""
    if number is None:
        return None
    cleaned = str(number).strip()
    if not cleaned:
        return None
    last4 = cleaned[-4:]
    return f"••••{last4}"


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def payos_transfer_details(invoice: Any) -> dict[str, Any] | None:
    """Extracts transfer details from an invoice's stored PayOS webhook payload.

    Returns None unless invoice.payment_method == "payos" and gateway_metadata["payos"]
    is a dict.
    Returns normalized dictionary with aware datetime (Asia/Ho_Chi_Minh) or None,
    and normalized string fields (empty strings converted to None). Never raises.
    """
    if invoice is None:
        return None

    payment_method = getattr(invoice, "payment_method", None)
    if payment_method != "payos":
        return None

    gateway_metadata = getattr(invoice, "gateway_metadata", None)
    if not isinstance(gateway_metadata, dict):
        return None

    payos_data = gateway_metadata.get("payos")
    if not isinstance(payos_data, dict):
        return None

    raw_dt = payos_data.get("transactionDateTime")
    transferred_at: datetime | None = None
    if raw_dt and isinstance(raw_dt, str) and raw_dt.strip():
        try:
            dt = datetime.strptime(raw_dt.strip(), "%Y-%m-%d %H:%M:%S")
            transferred_at = dt.replace(tzinfo=VIETNAM_TZ)
        except ValueError:
            try:
                dt = datetime.fromisoformat(raw_dt.strip())
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=VIETNAM_TZ)
                transferred_at = dt
            except Exception as exc:
                logger.warning(f"Failed to parse PayOS transactionDateTime {raw_dt!r}: {exc}")
                transferred_at = None
        except Exception as exc:
            logger.warning(f"Failed to parse PayOS transactionDateTime {raw_dt!r}: {exc}")
            transferred_at = None

    return {
        "transferred_at": transferred_at,
        "sender_name": _clean_str(payos_data.get("counterAccountName")),
        "sender_account_number": _clean_str(payos_data.get("counterAccountNumber")),
        "sender_bank_id": _clean_str(payos_data.get("counterAccountBankId")),
        "sender_bank_name": _clean_str(payos_data.get("counterAccountBankName")),
        "receiver_account_number": _clean_str(payos_data.get("accountNumber")),
        "virtual_account_name": _clean_str(payos_data.get("virtualAccountName")),
        "virtual_account_number": _clean_str(payos_data.get("virtualAccountNumber")),
        "bank_reference": _clean_str(payos_data.get("reference")),
        "payment_link_id": _clean_str(payos_data.get("paymentLinkId")),
        "transfer_description": _clean_str(payos_data.get("description")),
        "currency": _clean_str(payos_data.get("currency")),
    }


def customer_transfer_details(invoice: Any) -> dict[str, Any] | None:
    """Returns PayOS transfer details with sender account number masked (D4 privacy split)."""
    details = payos_transfer_details(invoice)
    if not details:
        return None
    copy_details = dict(details)
    copy_details["sender_account_number"] = mask_account(copy_details.get("sender_account_number"))
    return copy_details
