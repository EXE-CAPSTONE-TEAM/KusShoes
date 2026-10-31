"""coupons: allow discount_type 'grant_plan' (activation code -> COMP plan)

Revision ID: 034
Revises: 033
Create Date: 2026-10-31
"""
from alembic import op

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None

_OLD = "discount_type IN ('percent', 'fixed', 'fixed_price')"
_NEW = "discount_type IN ('percent', 'fixed', 'fixed_price', 'grant_plan')"


def upgrade() -> None:
    op.drop_constraint("ck_coupons_discount_type", "coupons", type_="check")
    op.create_check_constraint("ck_coupons_discount_type", "coupons", _NEW)


def downgrade() -> None:
    op.execute("DELETE FROM coupon_redemptions WHERE coupon_id IN "
               "(SELECT id FROM coupons WHERE discount_type = 'grant_plan')")
    op.execute("DELETE FROM coupons WHERE discount_type = 'grant_plan'")
    op.drop_constraint("ck_coupons_discount_type", "coupons", type_="check")
    op.create_check_constraint("ck_coupons_discount_type", "coupons", _OLD)
