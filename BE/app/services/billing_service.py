import uuid
from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    InvoiceNotRefundable,
    SubAlreadyActive,
    SubNoPolarCustomer,
    SubNotFound,
    SubPaymentGatewayError,
    SubPlanNotFound,
    SubPlanNotMappedToPolar,
)
from app.infrastructure import polar_client, task_queue
from app.infrastructure.polar_client import WebhookUnknownTypeError, WebhookVerificationError
from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.repositories import invoice_repo, plan_repo, subscription_repo, user_repo
from app.schemas.subscription import AdminInvoiceResponse, AdminSubscriptionResponse
from app.services.audit import record_audit

_CYCLE_TIMEDELTA = {
    "monthly": timedelta(days=30),
    "yearly": timedelta(days=365),
}


# --- Public read endpoints ---


async def list_plans(db: AsyncSession) -> list[Plan]:
    return await plan_repo.list_active(db)


async def get_current_subscription(db: AsyncSession, user) -> Subscription:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription:
        raise SubNotFound()
    return subscription


async def list_invoices(
    db: AsyncSession, user, *, limit: int, before: datetime | None
) -> list[Invoice]:
    return await invoice_repo.list_by_user(db, user.id, limit=limit, before=before)


# --- Checkout ---


async def create_checkout_session(
    db: AsyncSession, user, *, tier: str, billing_cycle: str
) -> str:
    plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    if not plan:
        raise SubPlanNotFound()
    if not plan.polar_product_id:
        raise SubPlanNotMappedToPolar()

    current = await subscription_repo.get_by_user(db, user.id)
    if current and current.tier == f"{tier}_{billing_cycle}" and current.status == "active":
        raise SubAlreadyActive()

    invoice = await invoice_repo.create_pending(
        db,
        user_id=user.id,
        plan_id=plan.id,
        plan_tier=tier,
        billing_cycle=billing_cycle,
        amount_vnd=plan.price_vnd,
        payment_method="polar",
    )
    await db.commit()

    try:
        checkout_id, checkout_url = await polar_client.create_checkout(
            product_id=plan.polar_product_id,
            external_customer_id=str(user.id),
            metadata={
                "invoice_id": str(invoice.id),
                "user_id": str(user.id),
                "tier": tier,
                "billing_cycle": billing_cycle,
            },
        )
    except Exception as exc:
        logger.error(f"Polar checkout creation failed: {exc}")
        raise SubPaymentGatewayError() from exc

    invoice.gateway_transaction_id = checkout_id
    invoice.gateway_payment_url = checkout_url
    await db.commit()
    return checkout_url


# --- Self-service subscription management ---
# These only trigger a change on Polar's side — the DB is updated later by the
# resulting webhook, never here, so there is exactly one write path for subscription state.


async def get_customer_portal_url(db: AsyncSession, user) -> str:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription or not subscription.polar_customer_id:
        raise SubNoPolarCustomer()
    try:
        return await polar_client.create_customer_portal_session(subscription.polar_customer_id)
    except Exception as exc:
        logger.error(f"Polar customer portal session creation failed: {exc}")
        raise SubPaymentGatewayError() from exc


async def cancel_subscription(db: AsyncSession, user, *, immediate: bool = False) -> None:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription or not subscription.polar_subscription_id:
        raise SubNotFound()
    if not immediate and subscription.cancel_at_period_end:
        raise SubAlreadyActive()
    try:
        await polar_client.cancel_subscription(
            subscription.polar_subscription_id, immediate=immediate
        )
    except Exception as exc:
        logger.error(f"Polar subscription cancellation failed: {exc}")
        raise SubPaymentGatewayError() from exc


async def change_plan(db: AsyncSession, user, *, tier: str, billing_cycle: str) -> None:
    subscription = await subscription_repo.get_by_user(db, user.id)
    if not subscription or not subscription.polar_subscription_id:
        raise SubNotFound()
    if subscription.tier == f"{tier}_{billing_cycle}":
        raise SubAlreadyActive()
    new_plan = await plan_repo.get_by_tier_and_cycle(db, tier, billing_cycle)
    if not new_plan:
        raise SubPlanNotFound()
    if not new_plan.polar_product_id:
        raise SubPlanNotMappedToPolar()
    try:
        await polar_client.update_subscription_product(
            subscription.polar_subscription_id, new_plan.polar_product_id
        )
    except Exception as exc:
        logger.error(f"Polar subscription product update failed: {exc}")
        raise SubPaymentGatewayError() from exc


# --- Admin oversight ---


async def admin_list_subscriptions(
    db: AsyncSession, *, tier: str | None, status: str | None, limit: int, before: datetime | None
) -> list[AdminSubscriptionResponse]:
    rows = await subscription_repo.list_all(
        db, tier=tier, status=status, limit=limit, before=before
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


async def admin_list_invoices(
    db: AsyncSession,
    *,
    status: str | None,
    user_id: uuid.UUID | None,
    limit: int,
    before: datetime | None,
) -> list[AdminInvoiceResponse]:
    rows = await invoice_repo.list_all(
        db, status=status, user_id=user_id, limit=limit, before=before
    )
    return [
        AdminInvoiceResponse(
            id=invoice.id,
            user_id=invoice.user_id,
            user_email=user_email,
            polar_order_id=(invoice.gateway_metadata or {}).get("polar_order_id"),
            plan_tier=invoice.plan_tier,
            billing_cycle=invoice.billing_cycle,
            amount_vnd=invoice.amount_vnd,
            payment_method=invoice.payment_method,
            status=invoice.status,
            paid_at=invoice.paid_at,
            created_at=invoice.created_at,
        )
        for invoice, user_email in rows
    ]


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


async def admin_refund_invoice(db: AsyncSession, admin, invoice_id: uuid.UUID) -> str:
    """Khởi tạo refund trên Polar. KHÔNG set status='refunded' tại đây —
    webhook refund.created → _handle_refund_event là write path duy nhất."""
    invoice = await invoice_repo.get_by_id(db, invoice_id)
    polar_order_id = (invoice.gateway_metadata or {}).get("polar_order_id") if invoice else None
    if (
        not invoice
        or invoice.status != "paid"
        or invoice.payment_method != "polar"
        or not polar_order_id
    ):
        raise InvoiceNotRefundable()

    try:
        polar_refund_id = await polar_client.create_refund(
            order_id=polar_order_id,
            amount_vnd=invoice.amount_vnd,
            comment=f"Refund by admin {admin.email}",
        )
    except Exception as exc:
        logger.error(f"Polar refund creation failed for invoice={invoice_id}: {exc}")
        raise SubPaymentGatewayError() from exc

    invoice.gateway_metadata = {
        **(invoice.gateway_metadata or {}),
        "polar_refund_id": polar_refund_id,
    }
    await record_audit(
        db, admin, "invoice.refund", target_type="invoice", target_id=invoice_id,
        payload={"polar_refund_id": polar_refund_id, "amount_vnd": invoice.amount_vnd},
    )
    await db.commit()
    return polar_refund_id


# --- Webhook handling ---


async def handle_polar_webhook(db: AsyncSession, *, raw_body: bytes, headers: dict) -> int:
    """Returns the HTTP status the router should respond with. Never raises for
    business-logic failures — logs and acks instead, so Polar never retry-storms us."""
    try:
        event = polar_client.verify_webhook_event(raw_body=raw_body, headers=headers)
    except WebhookVerificationError:
        logger.warning("Polar webhook signature invalid")
        return 403
    except WebhookUnknownTypeError:
        logger.info("Polar webhook: unknown event type, ack without processing")
        return 202

    try:
        await _dispatch_event(db, event)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception(f"Polar webhook processing failed for event type={event.type}")
        return 200
    return 200


async def _dispatch_event(db: AsyncSession, event) -> None:
    handlers = {
        "checkout.created": _handle_checkout_updated,
        "checkout.updated": _handle_checkout_updated,
        "checkout.expired": _handle_checkout_expired,
        "order.paid": _handle_order_paid,
        "order.refunded": _handle_refund_event,
        "refund.created": _handle_refund_event,
        "refund.updated": _handle_refund_event,
        "subscription.created": _handle_subscription_upsert,
        "subscription.active": _handle_subscription_upsert,
        "subscription.updated": _handle_subscription_upsert,
        "subscription.canceled": _handle_subscription_upsert,
        "subscription.uncanceled": _handle_subscription_upsert,
        "subscription.past_due": _handle_subscription_past_due,
        "subscription.revoked": _handle_subscription_revoked,
    }
    handler = handlers.get(event.type)
    if handler:
        await handler(db, event.data)
    else:
        logger.info(f"No handler for Polar event type={event.type}, ignoring")


async def _handle_checkout_updated(db: AsyncSession, data) -> None:
    invoice = await invoice_repo.get_by_gateway_transaction_id(db, data.id)
    if not invoice or invoice.status != "pending":
        return
    logger.info(f"Polar checkout {data.id} status={getattr(data, 'status', None)}")


async def _handle_checkout_expired(db: AsyncSession, data) -> None:
    invoice = await invoice_repo.get_by_gateway_transaction_id(db, data.id)
    if invoice and invoice.status == "pending":
        await invoice_repo.mark_failed(db, invoice)


async def _handle_order_paid(db: AsyncSession, data) -> None:
    metadata = getattr(data, "metadata", None) or {}
    invoice_id = metadata.get("invoice_id")
    invoice = None
    if invoice_id:
        invoice = await invoice_repo.get_by_id(db, uuid.UUID(invoice_id))
    if not invoice:
        checkout_id = getattr(data, "checkout_id", None)
        if checkout_id:
            invoice = await invoice_repo.get_by_gateway_transaction_id(db, checkout_id)
    if not invoice:
        logger.warning(f"Polar order.paid: no matching invoice for order={data.id}")
        return
    if invoice.status == "paid":
        return  # idempotent — already processed this order

    await invoice_repo.mark_paid(
        db,
        invoice,
        paid_at=datetime.now(UTC),
        gateway_metadata_patch={"polar_order_id": data.id},
    )

    subscription_data = getattr(data, "subscription", None)
    tier = invoice.plan_tier
    billing_cycle = invoice.billing_cycle
    full_tier = f"{tier}_{billing_cycle}"
    expires_at = datetime.now(UTC) + _CYCLE_TIMEDELTA.get(billing_cycle, timedelta(days=30))
    customer = getattr(data, "customer", None)
    polar_customer_id = getattr(customer, "id", None)
    polar_subscription_id = getattr(subscription_data, "id", None) or getattr(
        data, "subscription_id", None
    )

    await subscription_repo.upsert_from_polar(
        db,
        user_id=invoice.user_id,
        plan_id=invoice.plan_id,
        tier=full_tier,
        status="active",
        expires_at=expires_at,
        polar_subscription_id=polar_subscription_id,
        polar_customer_id=polar_customer_id,
        cancel_at_period_end=False,
        last_invoice_id=invoice.id,
    )

    user = await user_repo.get_by_id(db, invoice.user_id)
    if user:
        task_queue.enqueue_payment_confirmation_email(
            user.email, invoice.plan_tier, invoice.amount_vnd
        )


async def _handle_subscription_upsert(db: AsyncSession, data) -> None:
    customer = getattr(data, "customer", None)
    external_id = getattr(customer, "external_id", None)
    if not external_id:
        logger.warning(f"Polar subscription event: no external_id on customer, sub={data.id}")
        return

    plan = await plan_repo.get_by_polar_product_id(db, getattr(data, "product_id", None) or "")
    status = "active" if getattr(data, "status", "active") != "canceled" else "cancelled"
    cancel_at_period_end = bool(getattr(data, "cancel_at_period_end", False))

    existing = await subscription_repo.get_by_polar_subscription_id(db, data.id)
    tier = existing.tier if existing and not plan else None
    if plan:
        tier = f"{plan.tier}_{plan.billing_cycle}"
    if not tier:
        logger.warning(f"Polar subscription event: cannot resolve plan for sub={data.id}")
        return

    current_period_end = getattr(data, "current_period_end", None)
    expires_at = current_period_end if current_period_end else None

    await subscription_repo.upsert_from_polar(
        db,
        user_id=uuid.UUID(external_id),
        plan_id=plan.id if plan else existing.plan_id,
        tier=tier,
        status=status,
        expires_at=expires_at,
        polar_subscription_id=data.id,
        polar_customer_id=getattr(customer, "id", None),
        cancel_at_period_end=cancel_at_period_end,
    )


async def _handle_subscription_past_due(db: AsyncSession, data) -> None:
    # No schema slot for "past_due" (status CHECK only allows active/cancelled/expired) —
    # accepted MVP limitation: log only, rely on subscription.revoked for the definitive
    # access-loss signal instead of widening the status contract.
    logger.warning(f"Polar subscription past_due: sub={data.id}")


async def _handle_subscription_revoked(db: AsyncSession, data) -> None:
    subscription = await subscription_repo.get_by_polar_subscription_id(db, data.id)
    if not subscription:
        return
    await _downgrade_to_free(db, subscription)


async def _handle_refund_event(db: AsyncSession, data) -> None:
    order_id = getattr(data, "order_id", None) or getattr(data, "id", None)
    invoice = None
    metadata = getattr(data, "metadata", None) or {}
    invoice_id = metadata.get("invoice_id")
    if invoice_id:
        invoice = await invoice_repo.get_by_id(db, uuid.UUID(invoice_id))
    if not invoice and order_id:
        invoice = await invoice_repo.get_by_gateway_transaction_id(db, order_id)
    if not invoice or invoice.status == "refunded":
        return
    await invoice_repo.mark_refunded(db, invoice)
    logger.warning(
        f"Invoice {invoice.id} marked refunded — subscription access NOT auto-revoked, "
        "use admin force-downgrade if access removal is intended"
    )


async def _downgrade_to_free(db: AsyncSession, subscription: Subscription) -> None:
    free_plan = await plan_repo.get_free_plan(db)
    if not free_plan:
        logger.error("Cannot downgrade subscription to free: free plan not found")
        return
    subscription.plan_id = free_plan.id
    subscription.tier = "free"
    subscription.status = "active"
    subscription.expires_at = None
    subscription.cancel_at_period_end = False
    await db.flush()
