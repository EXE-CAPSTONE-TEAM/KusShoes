"""Vietnamese labels shared by several report domains."""

from app.models.scan_credit import CREDIT_BILLING_CYCLE, CREDIT_INVOICE_TIER

STATUS_LABELS = {
    "paid": "Thành công",
    "failed": "Thất bại",
    "cancelled": "Đã hủy",
    "refunded": "Đã hoàn tiền",
    "awaiting_approval": "Chờ duyệt",
    "pending": "Chờ thanh toán",
}
METHOD_LABELS = {"payos": "Chuyển khoản VietQR", "momo": "MoMo", "manual": "Thủ công"}
# XR-1: a BR-94 scan-Credit invoice (SRS_v2.2.txt:1617) is discriminated by Track A's constants.
TIER_LABELS = {"basic": "Basic", "pro": "Pro", CREDIT_INVOICE_TIER: "Credit"}
CYCLE_LABELS = {"monthly": "tháng", "yearly": "năm", CREDIT_BILLING_CYCLE: "lượt"}
CREDIT_ITEM_LABEL = "Credit quét"
CHANNEL_LABELS = {
    "direct": "Trực tiếp",
    "tiktok": "TikTok",
    "facebook": "Facebook",
    "email": "Email",
    "referral": "Giới thiệu",
    "other": "Khác",
}


def channel_label(value: str | None) -> str:
    return CHANNEL_LABELS.get(value or "", "Khác")


def yes_no(value: bool) -> str:
    return "Có" if value else "Chưa"
