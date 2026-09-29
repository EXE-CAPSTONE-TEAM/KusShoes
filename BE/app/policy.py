"""Business retention windows shared across services (single source of truth)."""

ACCOUNT_RESTORE_DAYS = 30  # BR-06: deleted account can be restored, then is purged
PROJECT_RESTORE_DAYS = 30  # BR-47: trashed project can be restored, then is purged

# Version of the Terms of Service + Privacy Policy published at /terms and /privacy on the web app
# (FE src/content/legal.ts LEGAL_VERSION). Bump both together and users are asked to agree again.
LEGAL_VERSION = "1.0"
# What a user must have agreed to, at LEGAL_VERSION, to use the service (BR-02 / BR-89).
REQUIRED_CONSENT_TYPES = ("age_confirmation", "tos", "privacy_policy")
