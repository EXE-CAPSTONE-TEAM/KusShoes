"""SF-18 / BR-31: immutable KUS-xxx payment receipt (PDF).

The visible content is frozen into `invoice.receipt_snapshot` at issue time,
so the PDF can be re-rendered later without drifting (e.g. after the user
changes their email — BR-09)."""
from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ReceiptUnavailable
from app.infrastructure import storage
from app.repositories import consent_repo, invoice_repo
from app.services.period_service import GMT7
from app.utils.text import ascii_slug, format_vnd, mask_email, short_name

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
DOWNLOAD_TTL = 900  # NFR-SEC-05

_METHOD_LABELS = {
    "payos": "Chuyển khoản VietQR (PayOS)",
    "momo": "Ví MoMo",
    "manual": "Thanh toán thủ công",
}
_TIER_LABELS = {"basic": "Basic", "pro": "Pro"}
_CYCLE_LABELS = {"monthly": "Tháng", "yearly": "Năm"}


async def _next_receipt_number(db: AsyncSession) -> str:
    seq = await invoice_repo.next_receipt_seq(db)
    return f"KUS-{seq:05d}"


async def _build_snapshot(db: AsyncSession, invoice, user, receipt_number: str) -> dict:
    # BR-88: shortened name only if the customer agreed to academic use, else the account code.
    academic = await consent_repo.get_active(db, user.id, "academic_report")
    display_name = short_name(user.first_name, user.last_name) if academic else user.account_code
    paid_at = (invoice.paid_at or datetime.now(UTC)).astimezone(GMT7)
    return {
        "receipt_number": receipt_number,
        "order_code": invoice.order_code,
        "paid_at": paid_at.strftime("%d/%m/%Y %H:%M (GMT+7)"),
        "customer": display_name,
        "email": mask_email(user.email),
        "item": (
            f"Gói {_TIER_LABELS.get(invoice.plan_tier, invoice.plan_tier)}"
            f" — {_CYCLE_LABELS.get(invoice.billing_cycle, invoice.billing_cycle)}"
        ),
        "listed_price": invoice.listed_price_vnd,
        "discount": invoice.discount_vnd,
        "amount": invoice.amount_vnd,
        "status": "Đã thanh toán",
        "method": _METHOD_LABELS.get(invoice.payment_method, invoice.payment_method),
        "reference": invoice.payment_reference or "—",
        "file_slug": ascii_slug(display_name),
        "date_code": paid_at.strftime("%d%m%y"),
    }


def render_pdf(snapshot: dict) -> bytes:
    pdf = FPDF(format=(148, 210))
    pdf.add_page()
    pdf.add_font("Roboto", "", str(FONT_DIR / "Roboto-Regular.ttf"))
    pdf.add_font("Roboto", "B", str(FONT_DIR / "Roboto-Bold.ttf"))

    pdf.set_font("Roboto", "B", 16)
    pdf.cell(0, 10, "KusShoes", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Roboto", "B", 13)
    pdf.cell(0, 8, "BIÊN NHẬN THANH TOÁN", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Roboto", "", 10)
    pdf.cell(0, 6, f"Số: {snapshot['receipt_number']}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    rows = [
        ("Mã đơn", str(snapshot["order_code"])),
        ("Ngày giờ thanh toán", snapshot["paid_at"]),
        ("Khách hàng", snapshot["customer"]),
        ("Email", snapshot["email"]),
        ("Loại hàng hoá", snapshot["item"]),
        ("Giá niêm yết", format_vnd(snapshot["listed_price"])),
        ("Giảm giá", format_vnd(snapshot["discount"])),
        ("Số thực trả", format_vnd(snapshot["amount"])),
        ("Tình trạng", snapshot["status"]),
        ("Hình thức thanh toán", snapshot["method"]),
        ("Mã tham chiếu cổng", snapshot["reference"]),
    ]
    for label, value in rows:
        pdf.set_font("Roboto", "", 10)
        pdf.cell(50, 7, label)
        pdf.set_font("Roboto", "B" if label == "Số thực trả" else "", 10)
        pdf.cell(0, 7, value, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_font("Roboto", "", 8)
    pdf.multi_cell(
        0, 4.5,
        "Đây là biên nhận thanh toán, không phải hoá đơn GTGT. "
        "Biên nhận không thay đổi sau khi phát hành.",
    )
    return bytes(pdf.output())


def _file_path(user_id, snapshot: dict) -> str:
    # BR-106: KUS-{mã}-{tenkhongdau}-{ddmmyy}.pdf
    name = f"{snapshot['receipt_number']}-{snapshot['file_slug']}-{snapshot['date_code']}.pdf"
    return f"receipts/{user_id}/{name}"


async def issue_receipt(db: AsyncSession, invoice, user) -> None:
    """Idempotent. A storage outage must never block subscription activation, so
    the number/snapshot are committed with the payment and the PDF upload is best-effort
    (`get_download_url` re-renders and uploads lazily if it failed)."""
    if invoice.receipt_number:
        return
    number = await _next_receipt_number(db)
    snapshot = await _build_snapshot(db, invoice, user, number)
    invoice.receipt_number = number
    invoice.receipt_snapshot = snapshot
    try:
        path = _file_path(user.id, snapshot)
        storage.upload_bytes(path, render_pdf(snapshot), "application/pdf")
        invoice.receipt_path = path
    except Exception:
        logger.exception(f"Receipt upload failed for {number}; will retry on download")
    await db.flush()


async def get_download_url(invoice) -> str:
    if invoice.status not in ("paid", "refunded") or not invoice.receipt_snapshot:
        raise ReceiptUnavailable()
    snapshot = invoice.receipt_snapshot
    path = invoice.receipt_path or _file_path(invoice.user_id, snapshot)
    if not invoice.receipt_path:
        storage.upload_bytes(path, render_pdf(snapshot), "application/pdf")
        invoice.receipt_path = path
    return storage.generate_presigned_download_url(path, ttl=DOWNLOAD_TTL)
