"""Business retention windows shared across services (single source of truth)."""

ACCOUNT_RESTORE_DAYS = 30  # BR-06: deleted account can be restored, then is purged
PROJECT_RESTORE_DAYS = 30  # BR-47: trashed project can be restored, then is purged

# Version of the Terms of Service + Privacy Policy published at /terms and /privacy on the web app
# (FE src/content/legal.ts LEGAL_VERSION). Bump both together and users are asked to agree again.
LEGAL_VERSION = "1.0"
# What a user must have agreed to, at LEGAL_VERSION, to use the service (BR-02 / BR-89).
REQUIRED_CONSENT_TYPES = ("age_confirmation", "tos", "privacy_policy")

# BR-109: design saves (DesignRevision.client) that count as having used KusStudio, which is what
# unlocks feedback. Template apply / version restore ("web") and re-crop resets ("desktop") are not
# a Save in Studio. Migration 033 backfills from this list plus 016's pre-tracking rows.
STUDIO_SAVE_CLIENTS = frozenset({"editor", "service"})

# Admin finance dashboard chart windows (Finance feedback 2026-10: "1 tháng" / "6 tháng").
FINANCE_SERIES_DAYS = 30  # rolling daily points; same window as the analytics default
FINANCE_SERIES_MONTHS = 6  # calendar months incl. the current one
