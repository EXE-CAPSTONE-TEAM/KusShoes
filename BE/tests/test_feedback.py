import io
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
from openpyxl import load_workbook

from app.utils.jwt import create_access_token


async def _admin(db):
    from app.repositories import user_repo

    admin = await user_repo.create_email_user(
        db,
        email="fb-admin@example.com",
        username="fbadmin",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Admin",
        last_name="Feedback",
    )
    admin.is_verified = True
    admin.role = "admin"
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), role='admin')}"}


@pytest.mark.asyncio
async def test_submit_and_cooldown(client, db, auth_headers):
    eligibility = await client.get("/api/v1/feedback/eligibility", headers=auth_headers)
    assert eligibility.json()["can_submit"] is True

    created = await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"rating": 4, "message": "Studio dễ dùng", "marketing_group": "product"},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "new"

    again = await client.post(
        "/api/v1/feedback", headers=auth_headers, json={"rating": 5, "message": "Thêm lần nữa"}
    )
    assert again.status_code == 429
    assert again.json()["code"] == "FEEDBACK_TOO_SOON"
    assert "next_allowed_at" in again.json()

    eligibility = await client.get("/api/v1/feedback/eligibility", headers=auth_headers)
    assert eligibility.json()["can_submit"] is False

    # After 14 days the form opens again.
    from app.repositories import feedback_repo

    latest = await feedback_repo.latest_for_user(db, await _uid(db))
    latest.created_at = datetime.now(UTC) - timedelta(days=15)
    await db.commit()
    ok = await client.post(
        "/api/v1/feedback", headers=auth_headers, json={"rating": 3, "message": "Sau 15 ngày"}
    )
    assert ok.status_code == 201


async def _uid(db):
    from app.repositories import user_repo

    return (await user_repo.get_by_email(db, "profile@example.com")).id


@pytest.mark.asyncio
async def test_rating_bounds_validated(client, auth_headers):
    for rating in (0, 6):
        response = await client.post(
            "/api/v1/feedback", headers=auth_headers, json={"rating": rating, "message": "abc"}
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_triage_summary_and_internal_exclusion(client, db, auth_headers):
    from app.repositories import user_repo

    admin_headers = await _admin(db)
    await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"rating": 2, "message": "Giá hơi cao", "marketing_group": "price"},
    )

    internal = await user_repo.create_email_user(
        db,
        email="staffer@example.com",
        username="staffer",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="In",
        last_name="Ternal",
    )
    internal.is_verified = True
    internal.is_internal = True
    await db.commit()
    internal_headers = {"Authorization": f"Bearer {create_access_token(str(internal.id))}"}
    await client.post(
        "/api/v1/feedback", headers=internal_headers, json={"rating": 5, "message": "Nội bộ test"}
    )

    listing = await client.get("/api/v1/admin/feedback", headers=admin_headers)
    assert [f["message"] for f in listing.json()] == ["Giá hơi cao"]
    with_internal = await client.get(
        "/api/v1/admin/feedback?include_internal=true", headers=admin_headers
    )
    assert len(with_internal.json()) == 2

    summary = (await client.get("/api/v1/admin/feedback/summary", headers=admin_headers)).json()
    assert summary["count"] == 1
    assert summary["average_rating"] == 2.0
    assert summary["by_group"] == {"price": 1}
    assert summary["by_status"]["new"] == 1

    feedback_id = listing.json()[0]["id"]
    updated = await client.patch(
        f"/api/v1/admin/feedback/{feedback_id}",
        headers=admin_headers,
        json={"status": "planned", "changed_what": "Thêm gói Basic giá sinh viên"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "planned"

    mine = (await client.get("/api/v1/feedback/mine", headers=auth_headers)).json()
    assert mine[0]["changed_what"] == "Thêm gói Basic giá sinh viên"

    invalid = await client.patch(
        f"/api/v1/admin/feedback/{feedback_id}", headers=admin_headers, json={"status": "bogus"}
    )
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_export_xlsx_excludes_internal(client, db, auth_headers):
    admin_headers = await _admin(db)
    await client.post(
        "/api/v1/feedback", headers=auth_headers, json={"rating": 5, "message": "Rất tốt"}
    )
    response = await client.get("/api/v1/admin/feedback/export", headers=admin_headers)
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    sheet = load_workbook(io.BytesIO(response.content)).active
    rows = list(sheet.iter_rows(values_only=True))
    assert rows[0][0] == "Ngày gửi"
    assert len(rows) == 2
    assert rows[1][4] == "Rất tốt"


@pytest.mark.asyncio
async def test_staff_cannot_update_feedback(client, db, auth_headers):
    from app.repositories import user_repo

    staff = await user_repo.create_email_user(
        db,
        email="fb-staff@example.com",
        username="fbstaff",
        password_hash=bcrypt.hashpw(b"Password1", bcrypt.gensalt(rounds=4)).decode(),
        first_name="Staff",
        last_name="Member",
    )
    staff.is_verified = True
    staff.role = "staff"
    await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(staff.id), role='staff')}"}
    created = await client.post(
        "/api/v1/feedback", headers=auth_headers, json={"rating": 4, "message": "OK nhé"}
    )
    response = await client.patch(
        f"/api/v1/admin/feedback/{created.json()['id']}",
        headers=headers,
        json={"status": "reviewed"},
    )
    assert response.status_code == 403
