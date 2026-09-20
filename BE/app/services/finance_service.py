"""UC-28: manual (off-gateway) transactions with maker/checker approval (BR-95)."""
import uuid
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AdminUserNotFound,
    InvoiceNotAwaitingApproval,
    InvoiceNotFound,
    ManualPaymentInvalid,
    ManualPaymentSelfApproval,
    SubPlanNotFound,
)
from app.infrastructure import storage
from app.repositories import invoice_repo, plan_repo, project_repo, subscription_repo, user_repo
from app.schemas.finance import ProofUploadRequest, ProofUploadResponse
from app.services import billing_service, period_service
from app.services.audit import record_audit

PROOF_PREFIX = "payment-proofs/"
_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def create_proof_upload(admin, body: ProofUploadRequest) -> ProofUploadResponse:
    file_path = f"{PROOF_PREFIX}{admin.id}/{uuid.uuid4()}{_EXT[body.content_type]}"
    return ProofUploadResponse(
        upload_url=storage.generate_presigned_upload_url(file_path, body.content_type),
        file_path=file_path,
    )


def _paid_at_for(paid_on: date) -> datetime:
    today = period_service.to_business_date(datetime.now(UTC))
    if paid_on > today:
        raise ManualPaymentInvalid("Ngày thu tiền không được ở tương lai")
    if paid_on == today:
        return datetime.now(UTC)
    return datetime.combine(paid_on, time(12, 0), tzinfo=period_service.GMT7)


async def create_manual_transaction(
    db: AsyncSession,
    admin,
    *,
    user_id: uuid.UUID,
    tier: str,
    billing_cycle: str,
    amount_vnd: int,
    paid_on: date,
    collected_by: str,
    proof_path: str,
    reason: str,
):
    # BR-95: proof, amount, date, collector and reason are all mandatory.
    if not proof_path.startswith(PROOF_PREFIX):
        raise ManualPaymentInvalid("Thiếu ảnh chứng từ hợp lệ")
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise AdminUserNotFound()
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    if not plan or plan.price_vnd <= 0:
        raise SubPlanNotFound()
    paid_at = _paid_at_for(paid_on)
    await period_service.assert_open(db, paid_at)

    invoice = await invoice_repo.create_manual(
        db,
        user_id=user.id,
        plan_id=plan.id,
        plan_tier=tier,
        billing_cycle=billing_cycle,
        order_code=billing_service._generate_order_code(),
        listed_price_vnd=plan.price_vnd,
        amount_vnd=amount_vnd,
        paid_at=paid_at,
        collected_by=collected_by,
        proof_path=proof_path,
        manual_reason=reason,
        created_by=admin.id,
    )
    await record_audit(
        db, admin, "transaction.manual_create", target_type="invoice", target_id=invoice.id,
        payload={"user_id": str(user.id), "amount_vnd": amount_vnd, "collected_by": collected_by},
    )
    await db.commit()
    return invoice


async def _get_awaiting(db: AsyncSession, invoice_id: uuid.UUID):
    invoice = await invoice_repo.get_by_id(db, invoice_id)
    if not invoice or not invoice.is_manual:
        raise InvoiceNotFound()
    if invoice.status != "awaiting_approval":
        raise InvoiceNotAwaitingApproval()
    return invoice


async def approve_manual_transaction(db: AsyncSession, admin, invoice_id: uuid.UUID):
    invoice = await _get_awaiting(db, invoice_id)
    if invoice.created_by == admin.id:
        raise ManualPaymentSelfApproval()
    await period_service.assert_open(db, invoice.paid_at)

    invoice.approved_by = admin.id
    await billing_service.activate_invoice(db, invoice, paid_at=invoice.paid_at)
    await record_audit(
        db, admin, "transaction.manual_approve", target_type="invoice", target_id=invoice.id,
        payload={"created_by": str(invoice.created_by)},
    )
    await db.commit()
    return invoice


async def reject_manual_transaction(db: AsyncSession, admin, invoice_id: uuid.UUID, reason: str):
    invoice = await _get_awaiting(db, invoice_id)
    await invoice_repo.mark_cancelled(db, invoice)
    await record_audit(
        db, admin, "transaction.manual_reject", target_type="invoice", target_id=invoice.id,
        payload={"reason": reason},
    )
    await db.commit()
    return invoice


async def grant_comp_plan(
    db: AsyncSession,
    admin,
    user_id: uuid.UUID,
    *,
    tier: str,
    billing_cycle: str,
    days: int,
    reason: str,
):
    """BR-103: support/compensation grant. Labelled COMP, creates no invoice and
    no revenue, and the account is not counted as a paying customer."""
    user = await user_repo.get_by_id(db, user_id)
    if not user:
        raise AdminUserNotFound()
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    subscription = await subscription_repo.get_by_user(db, user_id)
    if not plan or not subscription:
        raise SubPlanNotFound()
    now = datetime.now(UTC)
    subscription.plan_id = plan.id
    subscription.tier = f"{tier}_{billing_cycle}"
    subscription.status = "active"
    subscription.expires_at = now + timedelta(days=days)
    subscription.grace_until = None
    subscription.is_comp = True
    subscription.current_period_start = now
    subscription.cancel_at_period_end = False
    await db.flush()
    await project_repo.unlock_all_for_user(db, user_id)
    await record_audit(
        db, admin, "subscription.grant_comp", target_type="user", target_id=user_id,
        payload={"tier": subscription.tier, "days": days, "reason": reason},
    )
    await db.commit()
    return subscription
