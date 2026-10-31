"""scripts.create_activation_codes: N single-use, tier-bound, unguessable activation codes."""
from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa

from app.models.coupon import Coupon
from scripts.create_activation_codes import (
    CODE_ALPHABET,
    GROUP_LEN,
    GROUPS,
    create_codes,
    generate_code,
    parse_valid_until,
)

COUNT = 10
DAYS = 30


def test_generated_codes_follow_format_and_do_not_repeat():
    codes = {generate_code("KUS") for _ in range(500)}
    assert len(codes) == 500  # 31^8 space: a repeat in 500 draws would signal a broken RNG
    for code in codes:
        prefix, *groups = code.split("-")
        assert prefix == "KUS"
        assert len(groups) == GROUPS
        assert all(len(g) == GROUP_LEN and set(g) <= set(CODE_ALPHABET) for g in groups)


def test_valid_until_is_end_of_day_in_vietnam_time():
    value = parse_valid_until("2026-11-15")
    assert value == datetime(2026, 11, 15, 16, 59, 59, tzinfo=UTC)  # 23:59:59 +07:00
    assert parse_valid_until(None) is None


@pytest.mark.asyncio
async def test_creates_distinct_single_use_basic_codes(db):
    from tests.test_finance import _admin

    admin, _headers = await _admin(db, "script-admin@example.com", "scriptadmin")
    until = datetime.now(UTC) + timedelta(days=7)
    codes = await create_codes(db, admin, count=COUNT, days=DAYS, valid_until=until)

    assert len(set(codes)) == COUNT
    rows = (await db.execute(sa.select(Coupon).where(Coupon.code.in_(codes)))).scalars().all()
    assert len(rows) == COUNT
    for row in rows:
        assert row.discount_type == "grant_plan"
        assert row.value == DAYS
        assert row.plan_tiers == ["basic"]
        assert row.max_uses == 1
        assert row.used_count == 0
        assert row.is_active is True
        assert row.valid_until is not None


@pytest.mark.asyncio
async def test_each_code_activates_exactly_one_account(client, db):
    """Two different guests cannot share one individual code."""
    from tests.test_finance import _admin
    from tests.test_redeem_code import _headers, _make_user

    admin, _ = await _admin(db, "script-admin2@example.com", "scriptadmin2")
    (code,) = await create_codes(db, admin, count=1, days=DAYS)
    first, second = await _make_user(db, 1), await _make_user(db, 2)
    url = "/api/v1/subscription/redeem-code"

    assert (await client.post(url, headers=_headers(first), json={"code": code})).status_code == 200
    assert (await client.post(url, headers=_headers(second), json={"code": code})).status_code == 422
