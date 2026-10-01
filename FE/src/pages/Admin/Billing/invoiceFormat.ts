import type { AdminInvoice } from '../../../types/admin';

export const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
export const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const METHOD_LABEL: Record<AdminInvoice['payment_method'], string> = {
  payos: 'PayOS',
  momo: 'MoMo',
  manual: 'Thủ công',
};
export const CYCLE_LABEL: Record<AdminInvoice['billing_cycle'], string> = {
  monthly: 'Tháng',
  yearly: 'Năm',
};
export const tierLabel = (tier: string) => tier.charAt(0).toUpperCase() + tier.slice(1);
