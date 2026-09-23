"""BR-28 VAT toggle (SRS_v2.2.txt:1643).

"Giá niêm yết là số tiền cuối cùng khách trả (VND, đã gồm thuế nếu có). Dòng VAT chỉ hiển
thị khi bật cấu hình thuế …; khi bật, VAT được tách ra từ giá niêm yết, không cộng thêm."

The toggle defaults OFF (`settings.VAT_ENABLED`): until the team has an invoicing legal
entity it issues payment receipts without a VAT split (SRS_v2.2.txt:2782). The amount the
customer pays never depends on the toggle - VAT is only ever a breakdown of that amount.
"""
from app.config import settings


def vat_breakdown(amount_vnd: int) -> dict:
    """BR-28 (SRS_v2.2.txt:1643): VAT is EXTRACTED from the listed price, never added.

    vat = round(amount * rate / (100 + rate)); net = amount - vat, so
    `net_vnd + vat_vnd == amount_vnd` always holds. Only the VAT component is rounded,
    with Python's round-half-to-even; the total is never rounded or changed.
    """
    rate = settings.VAT_RATE_PERCENT
    if not settings.VAT_ENABLED or amount_vnd <= 0:
        return {"enabled": False, "rate_percent": rate, "vat_vnd": 0, "net_vnd": amount_vnd}
    vat = round(amount_vnd * rate / (100 + rate))
    return {"enabled": True, "rate_percent": rate, "vat_vnd": vat, "net_vnd": amount_vnd - vat}


def snapshot_fields(amount_vnd: int) -> dict:
    """The VAT fields frozen into a receipt snapshot at issue time (BR-31 immutability,
    SRS_v2.2.txt:1666): flipping the toggle later never changes an issued receipt."""
    breakdown = vat_breakdown(amount_vnd)
    return {
        "vat_enabled": breakdown["enabled"],
        "vat_rate_percent": breakdown["rate_percent"],
        "vat_vnd": breakdown["vat_vnd"],
        "net_vnd": breakdown["net_vnd"],
    }


def breakdown_for_invoice(invoice) -> dict:
    """Paid invoices report the VAT frozen in their receipt; unpaid ones use the live
    toggle. A receipt issued before VAT fields existed was issued without a VAT line."""
    snapshot = invoice.receipt_snapshot
    if snapshot:
        if "vat_enabled" in snapshot:
            return {
                "enabled": bool(snapshot["vat_enabled"]),
                "rate_percent": snapshot["vat_rate_percent"],
                "vat_vnd": snapshot["vat_vnd"],
                "net_vnd": snapshot["net_vnd"],
            }
        return {
            "enabled": False,
            "rate_percent": settings.VAT_RATE_PERCENT,
            "vat_vnd": 0,
            "net_vnd": invoice.amount_vnd,
        }
    return vat_breakdown(invoice.amount_vnd)


def tax_config() -> dict:
    return {"enabled": settings.VAT_ENABLED, "rate_percent": settings.VAT_RATE_PERCENT}
