"""Consent to the published Terms of Service + Privacy Policy (BR-02 / BR-89).

A user may use the service once they hold an active record of every REQUIRED_CONSENT_TYPES at
LEGAL_VERSION. Records are only written after an explicit tick: the sign-up form's box
(RegisterRequest.age_confirmed), `consent=true` on a new Google account, or the one-time
"agree to the updated documents" prompt (POST /users/me/legal-consent).
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.policy import LEGAL_VERSION, REQUIRED_CONSENT_TYPES
from app.repositories import consent_repo


async def record_legal_consent(db: AsyncSession, user_id: uuid.UUID, *, channel: str) -> None:
    """Record the 18+ confirmation and ToS/privacy consent at the current LEGAL_VERSION."""
    for consent_type in REQUIRED_CONSENT_TYPES:
        await consent_repo.create(
            db, user_id=user_id, type=consent_type, doc_version=LEGAL_VERSION, channel=channel
        )


async def has_current_legal_consent(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Agreed to every required document at the current LEGAL_VERSION and not revoked."""
    for consent_type in REQUIRED_CONSENT_TYPES:
        record = await consent_repo.get_active(db, user_id, consent_type)
        if record is None or record.doc_version != LEGAL_VERSION:
            return False
    return True


async def accept_current_documents(db: AsyncSession, user_id: uuid.UUID, *, channel: str) -> None:
    """The user ticked "18+ and I agree" for LEGAL_VERSION: supersede older versions, record it."""
    for consent_type in REQUIRED_CONSENT_TYPES:
        active = await consent_repo.get_active(db, user_id, consent_type)
        if active is not None and active.doc_version != LEGAL_VERSION:
            await consent_repo.revoke(db, active)
    if not await has_current_legal_consent(db, user_id):
        await record_legal_consent(db, user_id, channel=channel)
