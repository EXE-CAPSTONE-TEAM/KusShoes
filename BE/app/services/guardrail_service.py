"""BR-54 content guardrail + BR-45 edit lock, shared by every design-save path."""

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    ContentBanned,
    ContentTextTooLong,
    ContentTrademarkUnconfirmed,
    GuardrailRuleExists,
    GuardrailRuleNotFound,
    ProjectExporting,
)
from app.repositories import bake_job_repo, guardrail_repo
from app.services.audit import record_audit
from app.types import JsonObject
from app.utils.text import strip_accents

MAX_TEXT_LENGTH = 20
EXPORT_LOCK_MINUTES = 5


def normalize(value: str) -> str:
    """Accent-free lowercase words separated by single spaces."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", strip_accents(value).lower()).split())


def extract_texts(design_config: object) -> list[str]:
    if not isinstance(design_config, dict):
        return []
    layers = design_config.get("texts")
    if not isinstance(layers, list):
        return []
    values: list[str] = []
    for layer in layers:
        if isinstance(layer, dict):
            value = layer.get("value") or layer.get("text")
            if isinstance(value, str):
                values.append(value)
    return values


async def assert_not_exporting(db: AsyncSession, project_id: uuid.UUID) -> None:
    """BR-45: no edits while a bake started <5 min ago is still running. A job
    stuck longer than that no longer blocks the owner."""
    since = datetime.now(UTC) - timedelta(minutes=EXPORT_LOCK_MINUTES)
    if await bake_job_repo.get_recent_active_for_project(db, project_id, since):
        raise ProjectExporting()


async def check_design(db: AsyncSession, design_config: JsonObject) -> None:
    texts = extract_texts(design_config)
    if not texts:
        return
    for text in texts:
        if len(text) > MAX_TEXT_LENGTH:
            raise ContentTextTooLong(MAX_TEXT_LENGTH)
    padded = [f" {normalize(text)} " for text in texts]
    rules = await guardrail_repo.list_active(db)
    trademark_hits: list[str] = []
    for rule in rules:
        needle = f" {rule.term} "
        if not any(needle in text for text in padded):
            continue
        if rule.kind == "banned":
            raise ContentBanned()
        trademark_hits.append(rule.term)
    if trademark_hits and design_config.get("copyrightConfirmed") is not True:
        raise ContentTrademarkUnconfirmed(sorted(set(trademark_hits)))



# --- Admin CRUD -----------------------------------------------------------------------


async def list_rules(db: AsyncSession):
    return await guardrail_repo.list_all(db)


async def create_rule(db: AsyncSession, admin, *, kind: str, term: str):
    normalized = normalize(term)
    if not normalized:
        raise GuardrailRuleNotFound()
    if await guardrail_repo.get_by_term(db, normalized):
        raise GuardrailRuleExists()
    rule = await guardrail_repo.create(db, kind=kind, term=normalized)
    await record_audit(
        db, admin, "guardrail.create", target_type="guardrail_rule", target_id=rule.id,
        payload={"kind": kind, "term": normalized},
    )
    await db.commit()
    return rule


async def set_rule_active(db: AsyncSession, admin, rule_id: uuid.UUID, is_active: bool):
    rule = await guardrail_repo.get_by_id(db, rule_id)
    if not rule:
        raise GuardrailRuleNotFound()
    rule.is_active = is_active
    await record_audit(
        db, admin, "guardrail.update", target_type="guardrail_rule", target_id=rule.id,
        payload={"is_active": is_active},
    )
    await db.commit()
    return rule


async def delete_rule(db: AsyncSession, admin, rule_id: uuid.UUID) -> None:
    rule = await guardrail_repo.get_by_id(db, rule_id)
    if not rule:
        raise GuardrailRuleNotFound()
    await record_audit(
        db, admin, "guardrail.delete", target_type="guardrail_rule", target_id=rule.id,
        payload={"kind": rule.kind, "term": rule.term},
    )
    await guardrail_repo.delete(db, rule)
    await db.commit()
