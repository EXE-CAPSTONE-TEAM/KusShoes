import json
import math
import uuid
from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import (
    CouponInvalid,
    InvoiceNotFound,
    InvoiceNotRefundable,
    RefundInvalidAmount,
    RefundPolicyViolation,
    SubAlreadyActive,
    SubInvalidGateway,
    SubNotFound,
    SubPaymentGatewayError,
    SubPlanNotFound,
    SubPlanNotSellable,
)
from app.infrastructure import momo_client, payos_client, task_queue
from app.infrastructure.momo_client import MoMoError, MoMoSignatureError
from app.infrastructure.payos_client import PayOSError, PayOSSignatureError
from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.scan_credit import CREDIT_BILLING_CYCLE, CREDIT_INVOICE_TIER
from app.models.subscription import Subscription
from app.repositories import (
    export_record_repo,
    invoice_repo,
    plan_repo,
    project_repo,
    refund_repo,
    subscription_repo,
    user_repo,
)
from app.schemas.subscription import AdminInvoiceResponse, AdminSubscriptionResponse
from app.services import (
    coupon_service,
    credit_service,
    period_service,
    quota_service,
    receipt_service,
    tax_service,
)
from app.services.audit import record_audit

_CYCLE_TIMEDELTA = {
    "monthly": timedelta(days=30),
    "yearly": timedelta(days=365),
}


def _generate_order_code() -> int:
    """PayOS orderCode / MoMo orderId both need a compact unique identifier —
    a random value, not the sequential invoice UUID."""
    return uuid.uuid4().int & 0x7FFFFFFFFFFF


def _is_midcycle_upgrade(
    current: Subscription | None, *, new_billing_cycle: str, new_price_vnd: int, now: datetime
) -> bool:
    """BR-24: upgrading (not downgrading/switching cycle) while the current
    paid cycle hasn't expired yet."""
    if not current or current.tier == "free" or current.status != "active":
        return False
    if not current.expires_at or current.expires_at <= now:
        return False
    if current.billing_cycle != new_billing_cycle:
        return False
    return new_price_vnd > current.plan.price_vnd


def _prorated_upgrade_amount(
    *, old_price_vnd: int, new_price_vnd: int, expires_at: datetime, cycle_days: int, now: datetime
) -> int:
    """BR-24: (giá mới − giá cũ) × ngày còn lại ÷ ngày chu kỳ, làm tròn lên hàng nghìn."""
    days_remaining = max((expires_at - now).days, 0)
    raw = (new_price_vnd - old_price_vnd) * days_remaining / cycle_days
    return max(math.ceil(raw / 1000) * 1000, 1000)


# --- Public read endpoints ---


async def list_plans(db: AsyncSession) -> list[Plan]:
    return await plan_repo.list_active(db)


async def get_current_subscription(db: AsyncSession, user) -> Subscription:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription:
        raise SubNotFound()
    return subscription


async def get_subscription_view(db: AsyncSession, user) -> dict:
    """GET /subscription plus the BR-23 scan balance (plan scans left this cycle and
    spendable Credits) - the same numbers the internal scan-quota endpoint reports."""
    subscription = await get_current_subscription(db, user)
    balance = await quota_service.scan_balance(db, user.id, subscription)
    return {
        "id": subscription.id,
        "tier": subscription.tier,
        "status": subscription.status,
        "started_at": subscription.started_at,
        "expires_at": subscription.expires_at,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "scans_remaining_plan": balance.plan_remaining,
        "scans_remaining_credit": balance.credit_available,
    }


def to_invoice_view(invoice: Invoice) -> dict:
    """InvoiceResponse fields plus the BR-28 VAT breakdown (frozen receipt value once paid)."""
    return {
        "id": invoice.id,
        "order_code": invoice.order_code,
        "plan_tier": invoice.plan_tier,
        "billing_cycle": invoice.billing_cycle,
        "listed_price_vnd": invoice.listed_price_vnd,
        "discount_vnd": invoice.discount_vnd,
        "amount_vnd": invoice.amount_vnd,
        "payment_method": invoice.payment_method,
        "status": invoice.status,
        "receipt_number": invoice.receipt_number,
        "paid_at": invoice.paid_at,
        "created_at": invoice.created_at,
        "vat": tax_service.breakdown_for_invoice(invoice),
    }


async def list_invoices(
    db: AsyncSession, user, *, limit: int, before: datetime | None
) -> list[Invoice]:
    return await invoice_repo.list_by_user(db, user.id, limit=limit, before=before)


async def list_invoice_views(
    db: AsyncSession, user, *, limit: int, before: datetime | None
) -> list[dict]:
    invoices = await list_invoices(db, user, limit=limit, before=before)
    return [to_invoice_view(invoice) for invoice in invoices]


# --- Checkout ---


async def create_checkout_session(
    db: AsyncSession,
    user,
    *,
    tier: str,
    billing_cycle: str,
    gateway: str,
    coupon_code: str | None = None,
) -> str:
    # Note: BR-03 (unverified accounts can't pay) is already enforced upstream —
    # get_current_user's authenticate_user_access_token rejects unverified
    # users before any handler runs, so this endpoint is unreachable for them.
    if gateway not in ("payos", "momo"):
        raise SubInvalidGateway()

    plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    if not plan:
        raise SubPlanNotFound()
    if tier == "free" or plan.price_vnd <= 0:
        raise SubPlanNotSellable()

    current = await subscription_repo.get_by_user(db, user.id)
    if current and current.tier == f"{tier}_{billing_cycle}" and current.status == "active":
        raise SubAlreadyActive()

    now = datetime.now(UTC)
    amount_vnd = plan.price_vnd
    is_upgrade = _is_midcycle_upgrade(
        current, new_billing_cycle=billing_cycle, new_price_vnd=plan.price_vnd, now=now
    )
    coupon = None
    if coupon_code:
        if is_upgrade:  # a prorated upgrade is already discounted; codes don't stack (BR-26)
            raise CouponInvalid()
        coupon, coupon_discount = await coupon_service.evaluate(
            db, user, coupon_code, plan, plan.price_vnd
        )
        amount_vnd = plan.price_vnd - coupon_discount
    if is_upgrade:
        cycle_days = 30 if billing_cycle == "monthly" else 365
        amount_vnd = _prorated_upgrade_amount(
            old_price_vnd=current.plan.price_vnd,
            new_price_vnd=plan.price_vnd,
            expires_at=current.expires_at,
            cycle_days=cycle_days,
            now=now,
        )

    order_code = _generate_order_code()
    invoice = await invoice_repo.create_pending(
        db,
        user_id=user.id,
        plan_id=plan.id,
        plan_tier=tier,
        billing_cycle=billing_cycle,
        order_code=order_code,
        listed_price_vnd=plan.price_vnd,
        discount_vnd=plan.price_vnd - amount_vnd,
        coupon_code=coupon.code if coupon else None,
        is_upgrade=is_upgrade,
        amount_vnd=amount_vnd,
        payment_method=gateway,
    )
    await db.commit()

    description = f"KusShoes {tier} {billing_cycle}"[:25]
    return await _open_gateway_payment(db, invoice, gateway=gateway, description=description)


async def _open_gateway_payment(
    db: AsyncSession, invoice: Invoice, *, gateway: str, description: str
) -> str:
    """Create the PayOS/MoMo payment for a committed PENDING invoice and return its URL."""
    try:
        if gateway == "payos":
            checkout_url, payment_link_id = await payos_client.create_payment_link(
                order_code=invoice.order_code,
                amount=invoice.amount_vnd,
                description=description,
                return_url=settings.PAYOS_RETURN_URL,
                cancel_url=settings.PAYOS_CANCEL_URL,
            )
            invoice.gateway_transaction_id = payment_link_id
        else:
            checkout_url, _deeplink = await momo_client.create_payment(
                order_id=str(invoice.order_code),
                amount=invoice.amount_vnd,
                order_info=description,
                redirect_url=settings.MOMO_REDIRECT_URL,
                ipn_url=settings.MOMO_IPN_URL,
            )
    except (PayOSError, MoMoError) as exc:
        logger.error(f"{gateway} checkout creation failed: {exc}")
        raise SubPaymentGatewayError() from exc

    invoice.gateway_payment_url = checkout_url
    await db.commit()
    return checkout_url


async def create_credit_checkout(db: AsyncSession, user, *, quantity: int, gateway: str) -> str:
    """UC-27 / BR-94 (SRS_v2.2.txt:1617): PENDING invoice for `quantity` Credits at
    settings.CREDIT_PRICE_VND each. No coupon: BR-91 promotions exclude Credit
    (SRS_v2.2.txt:1597). The cycle the purchase counts against is recorded on the invoice."""
    if gateway not in ("payos", "momo"):
        raise SubInvalidGateway()
    cycle_start = await credit_service.assert_can_purchase(db, user, quantity)
    listed_price_vnd = settings.CREDIT_PRICE_VND * quantity
    invoice = await invoice_repo.create_pending(
        db,
        user_id=user.id,
        plan_id=None,
        plan_tier=CREDIT_INVOICE_TIER,
        billing_cycle=CREDIT_BILLING_CYCLE,
        order_code=_generate_order_code(),
        listed_price_vnd=listed_price_vnd,
        amount_vnd=listed_price_vnd,
        payment_method=gateway,
        is_upgrade=False,
        gateway_metadata=credit_service.cycle_metadata(cycle_start),
    )
    await db.commit()
    description = f"KusShoes Credit x{quantity}"[:25]
    return await _open_gateway_payment(db, invoice, gateway=gateway, description=description)


async def preview_coupon(
    db: AsyncSession, user, *, tier: str, billing_cycle: str, coupon_code: str
) -> dict:
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    if not plan or tier == "free":
        raise SubPlanNotFound()
    _coupon, discount = await coupon_service.evaluate(db, user, coupon_code, plan, plan.price_vnd)
    amount_vnd = plan.price_vnd - discount
    return {
        "listed_price_vnd": plan.price_vnd,
        "discount_vnd": discount,
        "amount_vnd": amount_vnd,
        "vat": tax_service.vat_breakdown(amount_vnd),  # BR-28 on the final payable amount
    }


# --- Self-service subscription management ---
# No stored card, no auto-renewal (NFR-SEC-04 / BR-25) — cancelling only
# stops the domain-side renewal expectation, there is nothing to call on
# a gateway that only ever processed a single one-off payment.


async def cancel_subscription(db: AsyncSession, user, *, immediate: bool = False) -> None:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription or subscription.is_free:
        raise SubNotFound()
    if immediate:
        await _downgrade_to_free(db, subscription)
    else:
        if subscription.cancel_at_period_end:
            raise SubAlreadyActive()
        subscription.cancel_at_period_end = True
        await db.flush()
    await db.commit()


# --- Admin oversight ---


async def admin_list_subscriptions(
    db: AsyncSession,
    *,
    tier: str | None,
    status: str | None,
    limit: int,
    before: datetime | None,
    before_id: uuid.UUID | None = None,
) -> list[AdminSubscriptionResponse]:
    rows = await subscription_repo.list_all(
        db, tier=tier, status=status, limit=limit, before=before, before_id=before_id
    )
    return [
        AdminSubscriptionResponse(
            id=subscription.id,
            user_id=subscription.user_id,
            user_email=user_email,
            tier=subscription.tier,
            status=subscription.status,
            started_at=subscription.started_at,
            expires_at=subscription.expires_at,
            cancel_at_period_end=subscription.cancel_at_period_end,
        )
        for subscription, user_email in rows
    ]


def to_admin_invoice(invoice: Invoice, user_email: str | None) -> AdminInvoiceResponse:
    return AdminInvoiceResponse(
        id=invoice.id,
        user_id=invoice.user_id,
        user_email=user_email,
        order_code=invoice.order_code,
        payment_reference=invoice.payment_reference,
        receipt_number=invoice.receipt_number,
        coupon_code=invoice.coupon_code,
        is_manual=invoice.is_manual,
        collected_by=invoice.collected_by,
        created_by=invoice.created_by,
        approved_by=invoice.approved_by,
        plan_tier=invoice.plan_tier,
        billing_cycle=invoice.billing_cycle,
        listed_price_vnd=invoice.listed_price_vnd,
        discount_vnd=invoice.discount_vnd,
        amount_vnd=invoice.amount_vnd,
        payment_method=invoice.payment_method,
        status=invoice.status,
        paid_at=invoice.paid_at,
        created_at=invoice.created_at,
        vat=tax_service.breakdown_for_invoice(invoice),
    )


async def admin_list_invoices(
    db: AsyncSession,
    *,
    status: str | None,
    user_id: uuid.UUID | None,
    limit: int,
    before: datetime | None,
    before_id: uuid.UUID | None = None,
    payment_method: str | None = None,
    is_manual: bool | None = None,
    exclude_internal: bool = False,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[AdminInvoiceResponse]:
    rows = await invoice_repo.list_all(
        db,
        status=status,
        user_id=user_id,
        payment_method=payment_method,
        is_manual=is_manual,
        exclude_internal=exclude_internal,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        before=before,
        before_id=before_id,
    )
    return [to_admin_invoice(invoice, user_email) for invoice, user_email in rows]


async def admin_force_downgrade(db: AsyncSession, admin, user_id: uuid.UUID) -> None:
    subscription = await subscription_repo.get_by_user(db, user_id)
    if not subscription:
        raise SubNotFound()
    previous_tier = subscription.tier
    await _downgrade_to_free(db, subscription)
    await record_audit(
        db, admin, "subscription.force_downgrade", target_type="user", target_id=user_id,
        payload={"previous_tier": previous_tier},
    )
    await db.commit()


REFUND_WINDOW_DAYS = 7


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def _refund_policy_violation(db: AsyncSession, invoice: Invoice) -> str | None:
    """BR-97: automatic refund needs <=7 days since payment AND no export in that cycle."""
    if invoice.paid_at is None:
        return None
    paid_at = _aware(invoice.paid_at)
    if datetime.now(UTC) - paid_at > timedelta(days=REFUND_WINDOW_DAYS):
        return "đã quá 7 ngày kể từ ngày thanh toán"
    if credit_service.is_credit_invoice(invoice):
        return await credit_service.refund_violation(db, invoice)
    if await export_record_repo.count_for_user_since(db, invoice.user_id, paid_at) > 0:
        return "đã xuất file sau khi thanh toán"
    return None


async def admin_refund_invoice(
    db: AsyncSession,
    admin,
    invoice_id: uuid.UUID,
    *,
    amount_vnd: int,
    reason: str,
    override: bool = False,
) -> uuid.UUID:
    """Creates a REFUND ledger entry (BR-97) — never calls the gateway. The
    invoice itself stays immutable (BR-31); this is the auditable reversal.
    A full refund of the account's current plan payment drops it back to Free."""
    invoice = await invoice_repo.get_by_id(db, invoice_id)
    if not invoice or invoice.status != "paid":
        raise InvoiceNotRefundable()
    if amount_vnd <= 0 or amount_vnd > invoice.amount_vnd:
        raise RefundInvalidAmount()
    # BR-98: the refund is a new entry dated today — it can't land in a locked period.
    await period_service.assert_open(db, datetime.now(UTC))
    violation = await _refund_policy_violation(db, invoice)
    if violation and not override:
        raise RefundPolicyViolation(violation)

    refund = await refund_repo.create(
        db, invoice_id=invoice.id, amount_vnd=amount_vnd, reason=reason, created_by=admin.id
    )
    await invoice_repo.mark_refunded(db, invoice)
    revoked_credits = 0
    if credit_service.is_credit_invoice(invoice):
        # BR-94: only still-available Credits are revoked; used ones are never restored,
        # and a Credit refund never touches the subscription.
        revoked_credits = await credit_service.revoke_for_refund(db, invoice)
    elif amount_vnd == invoice.amount_vnd:
        subscription = await subscription_repo.get_by_user(db, invoice.user_id)
        if subscription and subscription.last_invoice_id == invoice.id and not subscription.is_free:
            await _downgrade_to_free(db, subscription)
    await record_audit(
        db, admin, "invoice.refund", target_type="invoice", target_id=invoice_id,
        payload={
            "refund_id": str(refund.id),
            "amount_vnd": amount_vnd,
            "reason": reason,
            "policy_override": bool(violation and override),
            "policy_violation": violation,
            "revoked_credits": revoked_credits,
        },
    )
    await db.commit()
    return refund.id


# --- User-facing invoice/receipt (MSG29 polling, BR-31 download) ---


async def get_user_invoice(db: AsyncSession, user, invoice_id: uuid.UUID) -> Invoice:
    invoice = await invoice_repo.get_by_id(db, invoice_id)
    if not invoice or invoice.user_id != user.id:
        raise InvoiceNotFound()
    return invoice


async def get_user_invoice_view(db: AsyncSession, user, invoice_id: uuid.UUID) -> dict:
    return to_invoice_view(await get_user_invoice(db, user, invoice_id))


async def get_receipt_url(db: AsyncSession, user, invoice_id: uuid.UUID) -> str:
    invoice = await get_user_invoice(db, user, invoice_id)
    url = await receipt_service.get_download_url(invoice)
    await db.commit()
    return url


async def cancel_stale_pending_invoices(db: AsyncSession) -> int:
    """SF-06 / BR-30: gateway invoices still PENDING after 30 minutes become
    CANCELLED. A late SUCCESS webhook still activates them (see below)."""
    cutoff = datetime.now(UTC) - timedelta(minutes=30)
    stale = await invoice_repo.list_stale_pending(db, before=cutoff)
    for invoice in stale:
        await invoice_repo.mark_cancelled(db, invoice)
    await db.commit()
    return len(stale)


# --- Webhook / IPN handling ---


async def handle_payos_webhook(db: AsyncSession, *, raw_body: bytes) -> int:
    """Returns the HTTP status the router should respond with. Never raises for
    business-logic failures — logs and acks instead, so PayOS never retry-storms us."""
    try:
        payload = json.loads(raw_body)
        data = payos_client.verify_webhook_signature(payload)
    except (PayOSSignatureError, ValueError):
        logger.warning("PayOS webhook signature invalid")
        return 403

    if data.get("code") != "00":
        logger.info(f"PayOS webhook: non-success code={data.get('code')}, ack without processing")
        return 200

    try:
        await _activate_paid_invoice(
            db,
            order_code=int(data["orderCode"]),
            amount_vnd=int(data["amount"]),
            payment_reference=str(data.get("reference") or ""),
            gateway_metadata_patch={"payos": data},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("PayOS webhook processing failed")
        return 200
    return 200


async def handle_momo_ipn(db: AsyncSession, *, payload: dict) -> int:
    try:
        momo_client.verify_ipn_signature(payload)
    except MoMoSignatureError:
        logger.warning("MoMo IPN signature invalid")
        return 403

    if payload.get("resultCode") != 0:
        logger.info(f"MoMo IPN: resultCode={payload.get('resultCode')}, marking failed")
        try:
            invoice = await invoice_repo.get_by_order_code(db, int(payload["orderId"]))
            if invoice and invoice.status == "pending":
                await invoice_repo.mark_failed(db, invoice)
                await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("MoMo IPN failure-path processing failed")
        return 200

    try:
        await _activate_paid_invoice(
            db,
            order_code=int(payload["orderId"]),
            amount_vnd=int(payload["amount"]),
            payment_reference=str(payload.get("transId") or ""),
            gateway_metadata_patch={"momo": payload},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("MoMo IPN processing failed")
        return 200
    return 200


async def _activate_paid_invoice(
    db: AsyncSession,
    *,
    order_code: int,
    amount_vnd: int,
    payment_reference: str,
    gateway_metadata_patch: dict,
) -> None:
    invoice = await invoice_repo.get_by_order_code(db, order_code)
    if not invoice:
        logger.warning(f"Payment webhook: no invoice for order_code={order_code}")
        return
    if invoice.status == "paid":
        return  # idempotent — already processed
    if invoice.status not in ("pending", "cancelled", "failed"):
        logger.warning(f"Payment webhook ignored: invoice={invoice.id} status={invoice.status}")
        return
    if invoice.amount_vnd != amount_vnd:
        logger.error(
            f"Payment webhook: amount mismatch invoice={invoice.id} "
            f"expected={invoice.amount_vnd} got={amount_vnd}"
        )
        return
    if invoice.status == "cancelled":
        # BR-30: money was collected, so the entitlement is delivered anyway.
        logger.warning(f"LATE_PAYMENT_AFTER_CANCEL invoice={invoice.id} order={order_code}")

    await activate_invoice(
        db,
        invoice,
        paid_at=datetime.now(UTC),
        payment_reference=payment_reference,
        gateway_metadata_patch=gateway_metadata_patch,
    )


async def activate_invoice(
    db: AsyncSession,
    invoice: Invoice,
    *,
    paid_at: datetime,
    payment_reference: str | None = None,
    gateway_metadata_patch: dict | None = None,
) -> None:
    """Single write path that turns a confirmed payment (gateway webhook or a
    second admin's approval of a manual entry) into an active subscription,
    a redeemed coupon and an immutable receipt."""
    await invoice_repo.mark_paid(
        db,
        invoice,
        paid_at=paid_at,
        payment_reference=payment_reference,
        gateway_metadata_patch=gateway_metadata_patch,
    )

    if credit_service.is_credit_invoice(invoice):
        await _activate_credit_invoice(db, invoice)
        return

    full_tier = f"{invoice.plan_tier}_{invoice.billing_cycle}"
    now = datetime.now(UTC)

    # BR-24: a mid-cycle upgrade keeps the existing anchor date and usage window
    # instead of starting a fresh cycle.
    current = await subscription_repo.get_by_user(db, invoice.user_id)
    if invoice.is_upgrade and current and current.expires_at:
        expires_at = current.expires_at
        current_period_start = current.current_period_start
    else:
        # A manual entry's cycle runs from the day the money was actually collected.
        base = paid_at if invoice.is_manual else now
        expires_at = base + _CYCLE_TIMEDELTA.get(invoice.billing_cycle, timedelta(days=30))
        current_period_start = base

    await subscription_repo.upsert_after_payment(
        db,
        user_id=invoice.user_id,
        plan_id=invoice.plan_id,
        tier=full_tier,
        status="active",
        expires_at=expires_at,
        current_period_start=current_period_start,
        cancel_at_period_end=False,
        last_invoice_id=invoice.id,
    )
    # BR-27: renewing/upgrading immediately unlocks any read-only projects.
    await project_repo.unlock_all_for_user(db, invoice.user_id)

    user = await user_repo.get_by_id(db, invoice.user_id)
    if user:
        await coupon_service.redeem(db, invoice)
        await receipt_service.issue_receipt(db, invoice, user)
        task_queue.enqueue_payment_confirmation_email(
            user.email, invoice.plan_tier, invoice.amount_vnd, invoice.receipt_number
        )


async def _activate_credit_invoice(db: AsyncSession, invoice: Invoice) -> None:
    """BR-94: a paid Credit invoice mints its Credits, issues the receipt and sends the
    confirmation - it never touches the subscription, its cycle anchor or project locks."""
    await credit_service.mint_for_invoice(db, invoice)
    user = await user_repo.get_by_id(db, invoice.user_id)
    if user:
        await receipt_service.issue_receipt(db, invoice, user)
        task_queue.enqueue_payment_confirmation_email(
            user.email, invoice.plan_tier, invoice.amount_vnd, invoice.receipt_number
        )


async def _downgrade_to_free(db: AsyncSession, subscription: Subscription) -> None:
    free_plan = await plan_repo.get_free_plan(db)
    if not free_plan:
        logger.error("Cannot downgrade subscription to free: free plan not found")
        return
    now = datetime.now(UTC)
    subscription.plan_id = free_plan.id
    subscription.tier = "free"
    subscription.status = "active"
    subscription.expires_at = None
    subscription.grace_until = None
    subscription.cancel_at_period_end = False
    subscription.current_period_start = now
    await db.flush()
    # BR-27: lock any projects over the Free quota, most-recently-edited stay editable.
    await project_repo.lock_excess_for_user(
        db, subscription.user_id, free_plan.max_projects or 0
    )
