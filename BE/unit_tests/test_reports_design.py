"""Reports hub `thiet-ke-3d` (RP-7): pure shape_* seams, no database."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace

import pytest

from app.services import reports
from app.services.period_service import GMT7
from app.services.reports import design, registry


def ctx(start=date(2026, 3, 1), end=date(2026, 3, 31)):
    return registry.ReportContext(
        start=start,
        end=end,
        start_utc=datetime.combine(start, time.min, GMT7).astimezone(UTC),
        end_utc=datetime.combine(end + timedelta(days=1), time.min, GMT7).astimezone(UTC),
        generated_at=datetime.now(GMT7),
        actor_role="admin",
        max_rows=1000,
    )


def at(day, hour=12, minute=0):
    """GMT+7 wall-clock moment as aware UTC."""
    return datetime(2026, 3, day, hour, minute, tzinfo=GMT7).astimezone(UTC)


def test_all_five_registered_in_domain():
    specs = {s.id: s for s in registry.all_specs() if s.domain == "thiet-ke-3d"}
    assert set(specs) == {"projects-daily", "bake-jobs", "file-exports", "quota-usage", "templates"}
    assert specs["templates"].date_scoped is False
    assert all(s.date_scoped for key, s in specs.items() if key != "templates")
    assert reports.catalogue("admin")


def test_projects_daily_totals_and_creators():
    u1, u2 = uuid.uuid4(), uuid.uuid4()
    rows = [
        (u1, at(5), None, True),
        (u1, at(5, 14), None, False),
        (u2, at(5, 9), at(6), True),
        (u2, at(7), None, True),
    ]
    table = design.shape_projects_daily(rows, ctx())
    by_day = {r[0]: r for r in table}
    assert by_day[date(2026, 3, 5)][1:] == [3, 2, 0, 2]
    assert by_day[date(2026, 3, 6)][1:] == [0, 0, 1, 0]
    assert sum(r[1] for r in table) == len(rows)
    assert sum(r[3] for r in table) == 1
    assert all(r[2] <= r[1] for r in table)


def test_projects_daily_gmt7_day_bucketing():
    u = uuid.uuid4()
    # 23:30 on the 5th and 00:30 on the 6th GMT+7 straddle midnight; in UTC both are the 5th
    rows = [(u, at(5, 23, 30), None, False), (u, at(6, 0, 30), None, False)]
    table = design.shape_projects_daily(rows, ctx())
    assert [(r[0], r[1]) for r in table] == [(date(2026, 3, 5), 1), (date(2026, 3, 6), 1)]


def test_projects_daily_excludes_out_of_window():
    rows = [(uuid.uuid4(), at(5), None, True)]
    assert design.shape_projects_daily(rows, ctx(date(2026, 3, 6), date(2026, 3, 9))) == []


def test_bake_jobs_average_ignores_unfinished_and_failed():
    def done(secs):
        return (
            at(3, 10),
            "bake",
            "low",
            "completed",
            at(3, 10),
            at(3, 10) + timedelta(seconds=secs),
        )

    rows = [
        done(10),
        done(20),
        (at(3, 11), "bake", "low", "failed", at(3, 11), at(3, 11) + timedelta(seconds=500)),
        (at(3, 12), "bake", "low", "claimed", at(3, 12), None),
        (at(3, 13), "bake", "low", "awaiting_client", None, None),
        (at(3, 14), "bake", "low", "cancelled", None, None),
    ]
    [row] = design.shape_bake_jobs(rows, ctx())
    _day, _kind, _prio, total, completed, failed, cancelled, avg = row
    assert (total, completed, failed, cancelled) == (6, 2, 1, 1)
    assert avg == pytest.approx(15.0)
    assert completed + failed + cancelled <= total


def test_bake_jobs_no_completed_gives_none_and_groups_by_kind_priority():
    rows = [
        (at(3), "bake", "low", "failed", None, None),
        (at(3), "prepare", "high", "awaiting_client", None, None),
    ]
    table = design.shape_bake_jobs(rows, ctx())
    assert len(table) == 2
    assert all(r[7] is None for r in table)
    assert sum(r[3] for r in table) == 2


def test_file_exports_sums_and_null_size():
    mb = design.BYTES_PER_MB
    rows = [
        (at(2), "glb", True, 2 * mb, 3),
        (at(2, 18), "glb", False, None, 0),
        (at(2), "obj", False, mb // 2, 1),
    ]
    table = design.shape_file_exports(rows, ctx())
    glb = next(r for r in table if r[1] == "GLB")
    assert glb[2:] == [2, 1, pytest.approx(2.0), 3]
    assert sum(r[2] for r in table) == len(rows)
    assert sum(r[4] for r in table) == pytest.approx(2.5)


def test_quota_usage_aggregates_and_sums_match():
    rows = [
        (at(1), "free", 2, 1, 0, 1),
        (at(1, 20), "free", 3, 4, 5, 6),
        (at(1), "pro_monthly", 10, 10, 10, 10),
    ]
    table = design.shape_quota_usage(rows, ctx())
    assert len(table) == 2
    free = next(r for r in table if r[1] == "Free")
    assert free[2:] == [2, 5, 5, 5, 7]
    assert sum(r[2] for r in table) == len(rows)
    assert sum(r[3] for r in table) == 15


def test_quota_usage_period_boundary_is_gmt7():
    # 2026-03-31 17:30 UTC == 2026-04-01 00:30 GMT+7 -> belongs to April
    moment = datetime(2026, 3, 31, 17, 30, tzinfo=UTC)
    row_in = [(moment, "free", 1, 0, 0, 0)]
    [row] = design.shape_quota_usage(row_in, ctx(date(2026, 4, 1), date(2026, 4, 30)))
    assert row[0] == "2026-04"
    assert design.shape_quota_usage(row_in, ctx()) == []


def test_templates_snapshot_handles_null_category_and_unknown_status():
    def template(**kwargs):
        base = {
            "name": "A",
            "category": None,
            "status": "approved",
            "layer_count": 3,
            "use_count": 7,
            "created_at": at(5, 23, 30),
        }
        return SimpleNamespace(**{**base, **kwargs})

    table = design.shape_templates([template(), template(status="weird", category="Sneaker")])
    assert len(table) == 2
    assert table[0][1] == ""
    assert table[0][5] == date(2026, 3, 5)
    assert table[1][2] == "weird"
    assert table[1][1] == "Sneaker"
    assert design.shape_templates([]) == []
