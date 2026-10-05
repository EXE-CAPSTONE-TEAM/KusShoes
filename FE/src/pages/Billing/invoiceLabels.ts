import type { TFunction } from 'i18next';
import type { Invoice } from '../../api/client';

// Mirrors CREDIT_INVOICE_TIER in BE/app/models/scan_credit.py.
const CREDIT_INVOICE_TIER = 'credit';

export type InvoiceStatusLabel = 'Paid' | 'Pending' | 'Failed' | 'Cancelled' | 'Refunded';

export function formatTierName(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** awaiting_approval (manual payments, BR-95) reads as Pending to the customer. */
export function normalizeInvoiceStatus(status: string): InvoiceStatusLabel {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'cancelled') return 'Cancelled';
  if (normalized === 'refunded') return 'Refunded';
  return 'Pending';
}

export function isCreditInvoice(invoice: Pick<Invoice, 'plan_tier'>): boolean {
  return invoice.plan_tier === CREDIT_INVOICE_TIER;
}

/** Line item as the receipt PDF words it: the Credit count, or the plan and its own cycle. */
export function invoiceItemLabel(
  invoice: Pick<Invoice, 'plan_tier' | 'billing_cycle' | 'credit_quantity'>,
  t: TFunction,
): string {
  if (isCreditInvoice(invoice)) {
    return invoice.credit_quantity != null
      ? t('bill.creditsItem', { count: invoice.credit_quantity })
      : t('bill.creditsItemGeneric');
  }
  return t('bill.planService', {
    tier: formatTierName(invoice.plan_tier),
    cycle: t(`cycle.${invoice.billing_cycle}`, { defaultValue: invoice.billing_cycle }),
  });
}

/** Review page URL that re-opens checkout for the same item, used by "Try again". */
export function retryCheckoutPath(
  invoice: Pick<Invoice, 'plan_tier' | 'billing_cycle' | 'credit_quantity' | 'coupon_code' | 'payment_method'>,
): string {
  const params = new URLSearchParams();
  if (isCreditInvoice(invoice)) {
    params.set('type', 'credit');
    params.set('qty', String(invoice.credit_quantity ?? 1));
  } else {
    params.set('type', 'plan');
    params.set('tier', invoice.plan_tier);
    params.set('cycle', invoice.billing_cycle);
    if (invoice.coupon_code) params.set('coupon', invoice.coupon_code);
  }
  params.set('gateway', invoice.payment_method === 'momo' ? 'momo' : 'payos');
  return `/billing/checkout?${params.toString()}`;
}
