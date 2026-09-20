import io
import uuid
from datetime import UTC, date, datetime

import bcrypt
import pytest
from openpyxl import load_workbook

from app.services import analytics_service as svc
from app.services import report_service
from app.services.period_service import GMT7
from app.utils.jwt import create_access_token

U1, U2, U3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def _pay(user, day, amount=99000, cycle="monthly", tier="basic", upgrade=False):
    return svc.Payment(
        uuid.uuid4(), user, datetime(*day, 10, 0, tzinfo=GMT7), amount, cycle, tier, upgrade
    )


# --- pure metric definitions (no DB) ---------------------------------------------------


def test_add_months_clamps_to_last_day_and_ends_at_2359():
    end = svc.add_months(datetime(2026, 1, 31, 9, 0, tzinfo=GMT7), 1)
    assert (end.month, end.day, end.hour, end.minute) == (2, 28, 23, 59)
    assert svc.add_months(datetime(2026, 12, 15, 9, 0, tzinfo=GMT7), 1).year == 2027


def test_build_payments_nets_refunds_and_drops_fully_refunded():
    invoice_a, invoice_b = uuid.uuid4(), uuid.uuid4()
    paid = datetime(2026, 3, 1, tzinfo=UTC)
    rows = [
        (invoice_a, U1, paid, 100, "monthly", "basic", False),
        (invoice_b, U2, paid, 100, "monthly", "basic", False),
    ]
    refunds = [(invoice_a, U1, 40, paid), (invoice_b, U2, 100, paid)]
    payments = svc.build_payments(rows, refunds)
    assert [(p.user_id, p.amount) for p in payments] == [(U1, 60)]


def test_mrr_excludes_comp_free_and_normalises_yearly():
    history = svc.by_user(
        [
            _pay(U1, (2026, 3, 1), 99000),
            _pay(U2, (2026, 3, 1), 1200000, cycle="yearly"),
            _pay(U3, (2026, 3, 1), 99000),
        ]
    )
    subs = [
        (U1, "basic_monthly", "active", False),
        (U2, "pro_yearly", "grace", False),
        (U3, "basic_monthly", "active", True),  # COMP
        (uuid.uuid4(), "free", "active", False),
    ]
    assert svc.compute_mrr(history, subs) == 99000 + 100000


def test_churn_counts_only_due_and_unrenewed():
    history = svc.by_user(
        [
            _pay(U1, (2026, 3, 10)),  # due 10 Apr, never renews -> churned
            _pay(U2, (2026, 3, 12)),  # due 12 Apr, renews on 13 Apr (grace) -> kept
            _pay(U2, (2026, 4, 13)),
            _pay(U3, (2026, 4, 20)),  # not due in April
        ]
    )
    churn = svc.compute_churn(history, date(2026, 4, 1), date(2026, 4, 30))
    assert (churn.due, churn.churned, churn.rate) == (2, 1, 0.5)


def test_churn_counts_upgrade_cycle_once_not_superseded_cycle():
    history = svc.by_user(
        [_pay(U1, (2026, 3, 10)), _pay(U1, (2026, 3, 25), 149000, tier="pro", upgrade=True)]
    )
    churn = svc.compute_churn(history, date(2026, 4, 1), date(2026, 4, 30))
    # The 10 Apr cycle was superseded by the upgrade; only the new 25 Apr cycle is due.
    assert (churn.due, churn.churned) == (1, 1)


def test_retention_and_movement():
    monthly = svc.monthly_revenue_by_user(
        [
            _pay(U1, (2026, 3, 5), 100),
            _pay(U1, (2026, 4, 5), 150),  # expansion +50
            _pay(U2, (2026, 3, 6), 100),  # churn -100
            _pay(U3, (2026, 4, 7), 80),  # new +80
        ]
    )
    retention = svc.compute_retention(monthly, "2026-04")
    assert retention.nrr == 0.75  # 150 / 200
    assert retention.grr == 0.5  # min(150,100)=100 / 200
    movement = svc.compute_movement(monthly, "2026-04")
    assert (movement.new, movement.expansion, movement.churn) == (80, 50, 100)
    assert movement.net_new == 30


def test_repeat_rate_separates_not_yet_due():
    now = datetime(2026, 4, 20, tzinfo=GMT7)
    history = svc.by_user(
        [
            _pay(U1, (2026, 2, 1)),
            _pay(U1, (2026, 3, 1)),  # repeat
            _pay(U2, (2026, 4, 15)),  # single, not yet due
            _pay(U3, (2026, 1, 1)),  # single, overdue -> counts against rate
        ]
    )
    repeat = svc.compute_repeat(history, now)
    assert repeat.paying_customers == 3
    assert repeat.repeat_customers == 1
    assert repeat.not_yet_due == 1
    assert repeat.rate == 0.5  # 1 / (3 - 1)
    assert repeat.raw_rate == round(1 / 3, 4)


def test_report_renderers_produce_valid_files():
    headers, rows = ["Mã", "Giá"], [["KUS-00001", 99000], ["KUS-00002", 149000]]
    assert report_service.render_csv(headers, rows).startswith(b"\xef\xbb\xbf")
    sheet = load_workbook(io.BytesIO(report_service.render_xlsx("Sổ", headers, rows))).active
    assert [c.value for c in sheet[1]] == headers
    assert report_service.render_pdf("Sổ giao dịch", headers, rows).startswith(b"%PDF")


# --- API integration -------------------------------------------------------------------


async def _admin(db):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email="an-admin@example.com",
        username="anadmin",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="Analytics",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}


async def _paid_invoice(db, user, *, order_code, amount=99000, receipt="KUS-00001"):
    from app.models.invoice import Invoice
    from app.repositories import plan_repo

    plan = await plan_repo.get_by_tier_and_cycle(db, "basic", "monthly")
    now = datetime.now(UTC)
    invoice = Invoice(
        user_id=user.id,
        plan_id=plan.id,
        plan_tier="basic",
        billing_cycle="monthly",
        order_code=order_code,
        listed_price_vnd=amount,
        discount_vnd=0,
        amount_vnd=amount,
        payment_method="payos",
        status="paid",
        paid_at=now,
        receipt_number=receipt,
        receipt_snapshot={"customer": "Nguyễn V. A", "file_slug": "nguyenvana", "date_code": "200926"},
    )
    db.add(invoice)
    await db.commit()
    return invoice


@pytest.mark.asyncio
async def test_analytics_endpoint_excludes_internal_and_counts_customers(
    client, db, authenticated_user
):
    from app.repositories import user_repo

    admin_headers = await _admin(db)
    await _paid_invoice(db, authenticated_user, order_code=900001)

    internal = await user_repo.create_email_user(
        db,
        email="internal-pay@example.com",
        username="internalpay",
        password_hash=None,
        first_name="In",
        last_name="Ternal",
    )
    internal.is_internal = True
    await db.commit()
    await _paid_invoice(db, internal, order_code=900002, amount=500000, receipt="KUS-00002")

    response = await client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["paying_customers"] == 1
    assert body["revenue_vnd"]["current"] == 99000
    assert body["top_customers"][0]["net_paid_vnd"] == 99000
    assert body["revenue_by_plan"][0]["plan_tier"] == "basic"
    assert body["free_to_paid"]["numerator"] == 1


@pytest.mark.asyncio
async def test_transactions_ledger_column_order_and_downloads(client, db, authenticated_user):
    admin_headers = await _admin(db)
    await _paid_invoice(db, authenticated_user, order_code=900003)

    csv_response = await client.get(
        "/api/v1/admin/reports/transactions?format=csv", headers=admin_headers
    )
    assert csv_response.status_code == 200
    lines = csv_response.content.decode("utf-8-sig").splitlines()
    assert lines[0].split(",")[:3] == ["Mã", "Ngày đặt", "Tên khách"]
    assert lines[0].split(",")[-1] == "Khách quay lại?"
    assert "KUS-00001-nguyenvana-200926.pdf" in lines[1]

    xlsx = await client.get(
        "/api/v1/admin/reports/transactions?format=xlsx", headers=admin_headers
    )
    assert xlsx.status_code == 200
    pdf = await client.get("/api/v1/admin/reports/channel-funnel?format=pdf", headers=admin_headers)
    assert pdf.content.startswith(b"%PDF")

    unknown = await client.get("/api/v1/admin/reports/bogus", headers=admin_headers)
    assert unknown.status_code == 422


@pytest.mark.asyncio
async def test_channel_funnel_counts_stages(client, db, authenticated_user):
    admin_headers = await _admin(db)
    authenticated_user.acquisition_channel = "tiktok"
    await db.commit()
    await _paid_invoice(db, authenticated_user, order_code=900004)

    response = await client.get(
        "/api/v1/admin/reports/channel-funnel?format=csv", headers=admin_headers
    )
    row = response.content.decode("utf-8-sig").splitlines()[1].split(",")
    assert row[1] == "TikTok"
    assert row[2:6] == ["1", "1", "0", "1"]  # registered, verified, designed, paid


@pytest.mark.asyncio
async def test_analytics_requires_admin(client, auth_headers):
    response = await client.get("/api/v1/admin/analytics", headers=auth_headers)
    assert response.status_code in (401, 403)
