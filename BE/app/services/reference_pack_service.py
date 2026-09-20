"""BR-71 reference pack: a PDF a craftsperson can work from.

Content is derived from the saved design_config only — there is no server-side
renderer, so 4-angle renders and flattened zone images are not included."""

import io
import uuid
from datetime import UTC, datetime

import qrcode
from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories import design_version_repo
from app.services.period_service import GMT7
from app.services.project_access import require_owner
from app.services.receipt_service import FONT_DIR

DISCLAIMER = (
    "Tài liệu tham khảo do KusShoes tạo tự động từ thiết kế của khách hàng. "
    "Màu sắc thực tế có thể khác so với hiển thị trên màn hình; vị trí và kích thước "
    "họa tiết chỉ mang tính tham khảo, nghệ nhân cần xác nhận lại với khách trước khi thực hiện."
)


def _layers(design_config: object, key: str) -> list[dict]:
    if not isinstance(design_config, dict):
        return []
    value = design_config.get(key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _fmt_color(value: object) -> str:
    return str(value) if isinstance(value, str) and value else "—"


def render_pdf(
    *,
    project_name: str,
    design_config: dict,
    version_no: int | None,
    generated_at: datetime,
    qr_url: str | None,
) -> bytes:
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.add_font("Roboto", "", str(FONT_DIR / "Roboto-Regular.ttf"))
    pdf.add_font("Roboto", "B", str(FONT_DIR / "Roboto-Bold.ttf"))

    def line(text: str, *, bold: bool = False, size: int = 10, gap: float = 6) -> None:
        pdf.set_font("Roboto", "B" if bold else "", size)
        pdf.multi_cell(0, gap, text, new_x="LMARGIN", new_y="NEXT")

    line("KusShoes — Gói tham khảo cho nghệ nhân", bold=True, size=16, gap=9)
    line(f"Dự án: {project_name}", bold=True, size=12, gap=8)
    stamp = generated_at.astimezone(GMT7).strftime("%d/%m/%Y %H:%M (GMT+7)")
    version_label = f"Phiên bản thiết kế: v{version_no}" if version_no else "Phiên bản thiết kế: hiện tại"
    line(f"{version_label}  |  Ngày tạo: {stamp}")
    pdf.ln(3)

    line("Màu nền & vật liệu", bold=True, size=12, gap=8)
    material = design_config.get("material")
    line(f"Màu nền: {_fmt_color(design_config.get('baseColor'))}")
    if isinstance(material, dict):
        for key, value in material.items():
            line(f"{key}: {value}")
    pdf.ln(2)

    texts = _layers(design_config, "texts")
    line("Chữ trên thiết kế", bold=True, size=12, gap=8)
    if not texts:
        line("Không có.")
    for index, layer in enumerate(texts, start=1):
        line(
            f"{index}. \"{layer.get('value') or layer.get('text') or ''}\" — "
            f"font: {layer.get('font') or '—'}, màu: {_fmt_color(layer.get('color'))}"
        )
    pdf.ln(2)

    stickers = _layers(design_config, "stickers")
    line("Danh sách layer họa tiết", bold=True, size=12, gap=8)
    if not stickers:
        line("Không có.")
    for index, layer in enumerate(stickers, start=1):
        source = layer.get("source") or "—"
        target = layer.get("targetMeshName") or "toàn bộ"
        line(f"{index}. Họa tiết ({source}) — vị trí: {target}, tỉ lệ: {layer.get('scale', '—')}")
    pdf.ln(3)

    line("Lưu ý", bold=True, size=12, gap=8)
    line(DISCLAIMER, size=9, gap=5)

    if qr_url:
        image = qrcode.make(qr_url)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        pdf.ln(3)
        line("Quét mã để xem/tải file 3D", bold=True, size=10)
        pdf.image(buffer, w=35)
    return bytes(pdf.output())


async def build_for_project(
    db: AsyncSession, user, project_id: uuid.UUID, *, token: str | None
) -> tuple[bytes, str]:
    project = await require_owner(db, project_id, user)
    latest = await design_version_repo.get_latest(db, project.id)
    design_config = project.design_config if isinstance(project.design_config, dict) else {}
    qr_url = f"{settings.ARTISAN_VIEWER_BASE_URL.rstrip('/')}/{token}" if token else None
    data = render_pdf(
        project_name=project.name,
        design_config=design_config,
        version_no=latest.version_no if latest else None,
        generated_at=datetime.now(UTC),
        qr_url=qr_url,
    )
    return data, f"reference-pack-{project.id}.pdf"
