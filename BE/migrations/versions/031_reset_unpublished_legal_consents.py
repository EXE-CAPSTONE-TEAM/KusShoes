"""consent_records: drop ToS / privacy / age consents recorded before the documents existed

Until the Terms of Service and Privacy Policy were published at /terms and /privacy (LEGAL_VERSION
"1.0"), sign-ups recorded consent to documents that did not exist, and Google sign-ups recorded
none. Those rows are not valid consent, so they are removed; affected users see the one-time
"agree to the Terms and Privacy Policy" prompt (GET /users/me legal_consent_required) and consent
for real. Optional consents (marketing, analytics cookies, academic report) are left untouched.

Revision ID: 031
Revises: 030
Create Date: 2026-09-29
"""
from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM consent_records "
        "WHERE type IN ('age_confirmation', 'tos', 'privacy_policy') AND created_at < now()"
    )


def downgrade() -> None:
    # Deleted consent records cannot be restored, and must not be: they were never valid.
    pass
