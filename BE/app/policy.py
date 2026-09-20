"""Business retention windows shared across services (single source of truth)."""

ACCOUNT_RESTORE_DAYS = 30  # BR-06: deleted account can be restored, then is purged
PROJECT_RESTORE_DAYS = 30  # BR-47: trashed project can be restored, then is purged
