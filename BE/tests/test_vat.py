"""Track A: BR-28 VAT toggle (SRS_v2.2.txt:1643; checkout :993; default off :2782).

VAT is EXTRACTED from the price the customer pays, never added, and is frozen into the
receipt snapshot at issue time (BR-31, SRS_v2.2.txt:1666)."""
import copy
import hashlib
import hmac
import uuid
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest
from fpdf import FPDF

from app.config import settings
from app.models.coupon import Coupon
from app.repositories import invoice_repo, plan_repo, subscription_repo, user_repo
from app.services import receipt_service, tax_service
from app.utils.jwt import create_access_token


async def _basic_checkout(client, db, user, headers):
    with patch(
        "app.infrastructure.payos_client.create_payment_link",
        new=AsyncMock(return_value=("https://pay.payos.vn/web/vat", f"link-{uuid.uuid4().hex}")),
    ):
        response = await client.post(
            "/api/v1/subscription/checkout",
            headers=headers,
            json={"tier": "basic", "billing_cycle": "monthly", "gateway": "payos"},
        )
    assert response.status_code == 200, response.text
    invoices = await invoice_repo.list_by_user(db, user.id, limit=5)
    return invoices[0]


async def _pay(client, invoice):
    data = {
        "orderCode": invoice.order_code,
        "amount": invoice.amount_vnd,
        "description": "KusShoes basic monthly",
        "reference": f"FT{invoice.order_code}",
        "code": "00",
        "desc": "success",
    }
    raw = "&".join(f"{k}={data[k]}" for k in sorted(data))
    signature = hmac.new(
        settings.PAYOS_CHECKSUM_KEY.encode(), raw.encode(), hashlib.sha256
    ).hexdigest()
    payload = {"code": "00", "desc": "success", "success": True, "data": data,
               "signature": signature}
    with patch("app.infrastructure.task_queue.enqueue_payment_confirmation_email"):
        response = await client.post("/api/v1/webhooks/payos", json=payload)
    assert response.status_code == 200


def _drawn_texts(snapshot: dict) -> tuple[bytes, list[str]]:
    """Render the real receipt PDF while recording every text cell it draws. (No PDF
    text-extraction library is installed and the embedded TTF font stores glyph ids,
    so the drawn cells are the reliable view of what the PDF contains.)"""
    texts: list[str] = []
    real_cell = FPDF.cell

    def spy(self, *args, **kwargs):
        text = kwargs.get("text", args[2] if len(args) > 2 else "")
        texts.append(str(text))
        return real_cell(self, *args, **kwargs)

    with patch.object(FPDF, "cell", spy):
        pdf = receipt_service.render_pdf(snapshot)
    return pdf, texts


@pytest.mark.asyncio
async def test_vat_off_by_default_no_line(client, db, auth_headers, authenticated_user):
    assert settings.VAT_ENABLED is False  # SRS_v2.2.txt:2782: no legal entity yet -> off
    invoice = await _basic_checkout(client, db, authenticated_user, auth_headers)
    body = (
        await client.get(f"/api/v1/subscription/invoices/{invoice.id}", headers=auth_headers)
    ).json()
    assert body["vat"] == {
        "enabled": False,
        "rate_percent": settings.VAT_RATE_PERCENT,
        "vat_vnd": 0,
        "net_vnd": invoice.amount_vnd,
    }
    assert settings.VAT_RATE_PERCENT == 8

    await _pay(client, invoice)
    await db.refresh(invoice)
    assert invoice.receipt_snapshot["vat_enabled"] is False
    _pdf, texts = _drawn_texts(invoice.receipt_snapshot)
    assert not any("VAT" in text for text in texts)


@pytest.mark.asyncio
async def test_vat_on_is_extracted_not_added(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    assert plan.price_vnd == 259000  # plan table SRS_v2.2.txt:890
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    invoice = await _basic_checkout(client, db, authenticated_user, auth_headers)
    assert invoice.amount_vnd == 259000

    body = (
        await client.get(f"/api/v1/subscription/invoices/{invoice.id}", headers=auth_headers)
    ).json()
    assert body["amount_vnd"] == 259000
    assert body["vat"] == {"enabled": True, "rate_percent": 8, "vat_vnd": 19185,
                           "net_vnd": 239815}
    assert body["vat"]["net_vnd"] + body["vat"]["vat_vnd"] == 259000


@pytest.mark.asyncio
async def test_total_is_identical_with_and_without_vat(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    amounts = (1, 999, 1000, 49000, 129000, 259000, 649000, 3108000, 7788000)
    for enabled in (False, True):
        monkeypatch.setattr(settings, "VAT_ENABLED", enabled)
        for amount in amounts:
            breakdown = tax_service.vat_breakdown(amount)
            assert breakdown["enabled"] is enabled
            assert breakdown["net_vnd"] + breakdown["vat_vnd"] == amount
            assert 0 <= breakdown["vat_vnd"] < amount

    monkeypatch.setattr(settings, "VAT_ENABLED", False)
    off = await _basic_checkout(client, db, authenticated_user, auth_headers)
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    on = await _basic_checkout(client, db, authenticated_user, auth_headers)
    assert off.amount_vnd == on.amount_vnd  # the customer always pays the listed price
    body = (
        await client.get(f"/api/v1/subscription/invoices/{off.id}", headers=auth_headers)
    ).json()
    assert body["amount_vnd"] == off.amount_vnd
    assert body["vat"]["enabled"] is True  # unpaid invoice: live toggle


@pytest.mark.asyncio
async def test_receipt_pdf_shows_vat_line_only_when_enabled(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    invoice = await _basic_checkout(client, db, authenticated_user, auth_headers)
    await _pay(client, invoice)
    await db.refresh(invoice)
    on_snapshot = invoice.receipt_snapshot
    assert on_snapshot["vat_enabled"] is True and on_snapshot["vat_vnd"] == 19185

    pdf_on, texts_on = _drawn_texts(on_snapshot)
    assert pdf_on.startswith(b"%PDF")
    assert f"Trong đó VAT ({settings.VAT_RATE_PERCENT}%)" in texts_on
    assert "19.185đ" in texts_on
    assert "259.000đ" in texts_on  # the amount paid is unchanged

    off_snapshot = {**on_snapshot, **tax_service.snapshot_fields(0), "vat_enabled": False}
    pdf_off, texts_off = _drawn_texts(off_snapshot)
    assert pdf_off.startswith(b"%PDF")
    assert not any("VAT" in text for text in texts_off)


@pytest.mark.asyncio
async def test_issued_receipt_snapshot_is_frozen_against_toggle(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    invoice = await _basic_checkout(client, db, authenticated_user, auth_headers)
    await _pay(client, invoice)
    await db.refresh(invoice)
    frozen = copy.deepcopy(invoice.receipt_snapshot)
    pdf_before = receipt_service.render_pdf(invoice.receipt_snapshot)

    monkeypatch.setattr(settings, "VAT_ENABLED", False)
    await db.refresh(invoice)
    assert invoice.receipt_snapshot == frozen
    assert receipt_service.render_pdf(invoice.receipt_snapshot) == pdf_before
    body = (
        await client.get(f"/api/v1/subscription/invoices/{invoice.id}", headers=auth_headers)
    ).json()
    assert body["vat"] == {"enabled": True, "rate_percent": 8, "vat_vnd": 19185,
                           "net_vnd": 239815}


@pytest.mark.asyncio
async def test_admin_tax_config_endpoint_requires_admin(client, db, auth_headers, monkeypatch):
    url = "/api/v1/admin/billing/tax-config"
    assert (await client.get(url, headers=auth_headers)).status_code == 403

    admin = await user_repo.create_email_user(
        db,
        email="vat-admin@example.com",
        username="vatadmin",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Vat",
        last_name="Admin",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    admin_headers = {
        "Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"
    }
    body = (await client.get(url, headers=admin_headers)).json()
    assert body == {"enabled": False, "rate_percent": settings.VAT_RATE_PERCENT}
    monkeypatch.setattr(settings, "VAT_ENABLED", True)
    assert (await client.get(url, headers=admin_headers)).json()["enabled"] is True


@pytest.mark.asyncio
async def test_coupon_preview_vat_matches_final_amount(
    client, db, auth_headers, authenticated_user, monkeypatch
):
    subscription = await subscription_repo.get_by_user(db, authenticated_user.id)
    assert subscription.tier == "free"
    coupon = Coupon(code="VATPCT20", discount_type="percent", value=20, is_active=True)
    db.add(coupon)
    await db.commit()
    monkeypatch.setattr(settings, "VAT_ENABLED", True)

    response = await client.post(
        "/api/v1/subscription/coupon/preview",
        headers=auth_headers,
        json={"tier": "basic", "billing_cycle": "monthly", "coupon_code": "VATPCT20"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["amount_vnd"] == body["listed_price_vnd"] - body["discount_vnd"]
    assert body["vat"] == tax_service.vat_breakdown(body["amount_vnd"])
    assert body["vat"]["net_vnd"] + body["vat"]["vat_vnd"] == body["amount_vnd"]
    assert body["vat"]["enabled"] is True
