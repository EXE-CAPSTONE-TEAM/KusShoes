import { request } from "./client";

export type CouponPreview = {
  listed_price_vnd: number;
  discount_vnd: number;
  amount_vnd: number;
};

export type Receipt = {
  receipt_number: string | null;
  download_url: string;
  expires_in: number;
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
};
