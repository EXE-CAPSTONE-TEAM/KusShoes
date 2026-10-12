"""Reports hub `kiem-duyet-bao-mat`: pure shape() seams, no database."""

import csv
import io
from datetime import UTC, date, datetime

import pytest

from app.repositories import login_history_repo
from app.services.period_service import GMT7
from app.services.reports import registry, render, trust
from app.services.reports.registry import ReportContext

IDS = ["feedback", "content-reports", "moderation-actions", "audit-log", "login-history"]
SENSITIVE = {"audit-log", "login-history"}
RAW_EMAIL = "victim@example.com"
T = datetime(2026, 1, 2, 3, 0, tzinfo=UTC)


@pytest.fixture
def ctx():
    return ReportContext(
        start=date(2026, 1, 1),
        end=date(2026, 1, 31),
        start_utc=datetime(2025, 12, 31, 17, tzinfo=UTC),
        end_utc=datetime(2026, 1, 31, 17, tzinfo=UTC),
        generated_at=datetime(2026, 2, 1, tzinfo=GMT7),
        actor_role="admin",
        max_rows=100,
    )


def _csv_cells(report_id, rows):
    spec = registry.get(report_id)
    shown = render.format_rows([c.kind for c in spec.columns], rows)
    body = render.render_csv([c.label for c in spec.columns], shown)
    return list(csv.reader(io.StringIO(body.decode("utf-8-sig"))))


def test_five_reports_registered_with_expected_sensitivity():
    specs = {s.id: s for s in registry.all_specs() if s.domain == trust.DOMAIN}
    assert sorted(specs) == sorted(IDS)
    assert {i for i, s in specs.items() if s.sensitive} == SENSITIVE


def test_login_history_range_tied_to_retention():
    assert registry.get("login-history").max_range_days == login_history_repo.RETENTION_DAYS


def test_row_width_matches_columns(ctx):
    shaped = {
        "feedback": trust.shape_feedback([(T, "KS-1", 4, "price", "m", "new", None, None)], ctx),
        "content-reports": trust.shape_content_reports(
            [(T, "copyright", "p", None, "KS-2", "new", None, None)], ctx
        ),
        "moderation-actions": trust.shape_moderation_actions(
            [(T, "KS-3", 1, "warning", "r", None, None)], ctx
        ),
        "audit-log": trust.shape_audit_log([(T, "a@x.io", "admin", "x", None, None, None)], ctx),
        "login-history": trust.shape_login_history([(T, "a@x.io", True, "1.1.1.1", "ua")], ctx),
    }
    for report_id, rows in shaped.items():
        assert rows and all(len(r) == len(registry.get(report_id).columns) for r in rows)


def test_dates_render_in_gmt7_not_utc(ctx):
    # 2026-01-31 18:30 UTC is already 01/02 01:30 in GMT+7.
    late = datetime(2026, 1, 31, 18, 30, tzinfo=UTC)
    fb = _csv_cells(
        "feedback", trust.shape_feedback([(late, "KS-1", 5, "product", "m", "new", None, late)], ctx)
    )
    assert fb[1][0] == "01/02/2026" and fb[1][7] == "01/02/2026"
    audit = _csv_cells(
        "audit-log", trust.shape_audit_log([(late, "a@x.io", "admin", "x", None, None, None)], ctx)
    )
    assert audit[1][0] == "01/02/2026 01:30"


def test_non_sensitive_reports_carry_account_code_and_no_email(ctx):
    outputs = [
        trust.shape_feedback([(T, "KS-1", 4, "price", "hi", "new", None, None)], ctx),
        trust.shape_content_reports([(T, "other", "p", None, "KS-2", "new", None, None)], ctx),
        trust.shape_moderation_actions([(T, "KS-3", 2, "share_restriction", "r", T, "KS-9")], ctx),
    ]
    for rows in outputs:
        assert not any("@" in str(v) for row in rows for v in row)
    assert outputs[0][0][1] == "KS-1"
    assert outputs[1][0][3] == "KS-2"
    assert outputs[2][0][1] == "KS-3" and outputs[2][0][6] == "KS-9"


def test_sensitive_reports_expose_email(ctx):
    audit = trust.shape_audit_log([(T, RAW_EMAIL, "admin", "a", None, None, None)], ctx)
    login = trust.shape_login_history([(T, RAW_EMAIL, False, None, None)], ctx)
    assert audit[0][1] == RAW_EMAIL and login[0][1] == RAW_EMAIL


def test_payload_json_is_stable_regardless_of_key_order():
    a = trust.json_payload({"b": 1, "a": {"y": 2, "x": "đ"}})
    b = trust.json_payload({"a": {"x": "đ", "y": 2}, "b": 1})
    assert a == b
    assert "đ" in a  # readable, not \u-escaped
    assert trust.json_payload(None) == "" and trust.json_payload({}) == ""


def test_payload_with_non_json_values_does_not_crash():
    assert "2026" in trust.json_payload({"at": datetime(2026, 1, 1, tzinfo=UTC)})


def test_untrusted_text_is_escaped_by_renderer_only(ctx):
    rows = trust.shape_feedback(
        [(T, "KS-1", 1, "product", '=HYPERLINK("x")', "new", "@cmd", None)], ctx
    )
    assert rows[0][4].startswith("=")  # shape does not pre-escape
    cells = _csv_cells("feedback", rows)
    assert cells[1][4].startswith("'=") and cells[1][6].startswith("'@")


def test_unknown_enum_values_fall_back_to_raw_key(ctx):
    row = trust.shape_feedback([(T, "KS-1", 3, "future", "m", "newstatus", None, None)], ctx)[0]
    assert row[3] == "future" and row[5] == "newstatus"


def test_login_success_flag_labels(ctx):
    rows = trust.shape_login_history(
        [(T, "a@x.io", True, None, None), (T, "a@x.io", False, None, None)], ctx
    )
    assert [r[2] for r in rows] == ["Có", "Không"]


def test_content_report_target_kind(ctx):
    rows = trust.shape_content_reports(
        [
            (T, "copyright", "p", None, "K", "new", None, None),
            (T, "other", None, "t", "K", "new", None, None),
        ],
        ctx,
    )
    assert [r[2] for r in rows] == ["Dự án", "Mẫu thiết kế"]
