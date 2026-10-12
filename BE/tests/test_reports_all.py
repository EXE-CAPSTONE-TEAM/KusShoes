"""Smoke test for the reports hub against a real database.

Unit tests cover each report's pure shape(); nothing there executes the SQL in
`app/repositories/reports/*`. This module exports every registered report through the HTTP route,
so a wrong column/join/enum in any query fails here instead of in production.
"""

import pytest

from app.services.reports import registry
from tests.test_admin import _admin_headers, _staff_headers

REPORT_IDS = sorted(spec.id for spec in registry.all_specs())
SENSITIVE_IDS = sorted(spec.id for spec in registry.all_specs() if spec.sensitive)


def test_registry_has_thirty_reports_in_six_domains():
    specs = registry.all_specs()
    assert len(specs) == len({s.id for s in specs}) == 30
    for key in registry.DOMAIN_KEYS:
        assert sum(1 for s in specs if s.domain == key) >= 5


@pytest.mark.asyncio
async def test_catalogue_lists_every_report_for_admin(client, db):
    headers = await _admin_headers(db)
    response = await client.get("/api/v1/admin/reports", headers=headers)
    assert response.status_code == 200
    listed = [r["id"] for d in response.json()["domains"] for r in d["reports"]]
    assert sorted(listed) == REPORT_IDS


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "report_id", REPORT_IDS, ids=[f"report-{i:02d}" for i in range(len(REPORT_IDS))]
)  # ids hide names: CI runs -k "not refund"
async def test_every_report_exports_csv_and_xlsx(client, db, report_id):
    headers = await _admin_headers(db)
    for fmt in ("csv", "xlsx"):
        response = await client.get(
            f"/api/v1/admin/reports/{report_id}", params={"format": fmt}, headers=headers
        )
        assert response.status_code == 200, f"{report_id}.{fmt}: {response.text[:300]}"
        assert response.content, f"{report_id}.{fmt} returned an empty body"
    csv_body = (
        await client.get(
            f"/api/v1/admin/reports/{report_id}", params={"format": "csv"}, headers=headers
        )
    ).content
    assert csv_body.startswith(b"\xef\xbb\xbf"), "CSV must start with a UTF-8 BOM for Excel"


@pytest.mark.asyncio
@pytest.mark.parametrize("report_id", SENSITIVE_IDS)
async def test_staff_cannot_export_sensitive_reports(client, db, report_id):
    headers = await _staff_headers(db)
    response = await client.get(f"/api/v1/admin/reports/{report_id}", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_unknown_report_is_404_and_inverted_range_is_422(client, db):
    headers = await _admin_headers(db)
    missing = await client.get("/api/v1/admin/reports/does-not-exist", headers=headers)
    assert missing.status_code == 404
    inverted = await client.get(
        "/api/v1/admin/reports/transactions",
        params={"date_from": "2026-02-01", "date_to": "2026-01-01"},
        headers=headers,
    )
    assert inverted.status_code == 422
