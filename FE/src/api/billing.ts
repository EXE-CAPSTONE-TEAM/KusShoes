import { request } from "./client";

// ---- VAT (BR-28): extracted from the listed price, never added ----------------------
export type VatBreakdown = {
  enabled: boolean;
  rate_percent: number;
  vat_vnd: number;
  net_vnd: number;
};

export type CouponPreview = {
  listed_price_vnd: number;
  discount_vnd: number;
  amount_vnd: number;
  vat: VatBreakdown;
};

export type Receipt = {
  receipt_number: string | null;
  download_url: string;
  expires_in: number;
};

// ---- Scan Credit (BR-94 / UC-27) -----------------------------------------------------

export type CreditBalance = {
  available: number;
  used: number;
  expired: number;
  purchased_this_cycle: number;
  max_per_cycle: number;
  price_vnd: number;
  next_expires_at: string | null;
  can_purchase: boolean;
  cycle_start: string;
};

export type CreditLedgerItem = {
  id: string;
  invoice_id: string | null;
  purchased_at: string;
  expires_at: string;
  status: string;
  consumed_at: string | null;
  consumed_ref: string | null;
  price_vnd: number;
};

export type CreditLedgerPage = {
  items: CreditLedgerItem[];
  next_cursor: string | null;
  has_next: boolean;
};

export const billingApi = {
  /** Price after a promo code for one plan, without creating an invoice (BR-26). */
  previewCoupon: (tier: string, billingCycle: string, couponCode: string) =>
    request<CouponPreview>("/api/v1/subscription/coupon/preview", {
      method: "POST",
      body: JSON.stringify({ tier, billing_cycle: billingCycle, coupon_code: couponCode }),
    }),

  /** Signed link (15 minutes) to the immutable KUS-xxxxx receipt PDF (BR-31). */
  getReceipt: (invoiceId: string) => request<Receipt>(`/api/v1/subscription/invoices/${invoiceId}/receipt`),

  /** BR-94: spendable, used and expired Credits, the cycle cap and whether more can be bought. */
  getCreditBalance: () => request<CreditBalance>("/api/v1/subscription/credits"),
  getCreditLedger: (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    return request<CreditLedgerPage>(`/api/v1/subscription/credits/ledger?${params.toString()}`);
  },
  /** UC-27: PENDING invoice for 1-3 Credits; ACTIVE Basic/Pro plan only. */
  createCreditCheckout: (quantity: number, gateway: "payos" | "momo") =>
    request<{ checkout_url: string }>("/api/v1/subscription/credits/checkout", {
      method: "POST",
      body: JSON.stringify({ quantity, gateway }),
    }).then((result) => result.checkout_url),
};
