import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { BillPage } from './BillPage';
import type { Invoice } from '../../api/client';

const mockPendingInvoice: Invoice = {
  id: 'inv-123',
  order_code: 100200,
  plan_tier: 'basic',
  billing_cycle: 'monthly',
  listed_price_vnd: 299000,
  discount_vnd: 0,
  amount_vnd: 299000,
  payment_method: 'payos',
  status: 'pending',
  receipt_number: null,
  paid_at: null,
  created_at: '2026-10-05T08:00:00Z',
  vat: { enabled: true, rate_percent: 8, vat_vnd: 22148, net_vnd: 276852 },
  transfer: null,
  subscription_period: null,
};

const mockPaidInvoice: Invoice = {
  id: 'inv-123',
  order_code: 100200,
  plan_tier: 'basic',
  billing_cycle: 'monthly',
  listed_price_vnd: 299000,
  discount_vnd: 0,
  amount_vnd: 299000,
  payment_method: 'payos',
  status: 'paid',
  receipt_number: 'KUS-2026-000001',
  paid_at: '2026-10-05T08:02:00Z',
  created_at: '2026-10-05T08:00:00Z',
  vat: { enabled: true, rate_percent: 8, vat_vnd: 22148, net_vnd: 276852 },
  transfer: {
    transferred_at: '2026-10-05T08:01:30Z',
    sender_name: 'TRAN VAN TEST',
    sender_account_number: '••••5678',
    sender_bank_id: '970407',
    sender_bank_name: 'Techcombank',
    receiver_account_number: '88889999',
    virtual_account_name: 'KUSSHOES',
    virtual_account_number: 'VA123',
    bank_reference: 'FT100200',
    payment_link_id: 'pl_100200',
    transfer_description: 'KusShoes basic monthly',
    currency: 'VND',
  },
  subscription_period: {
    start: '2026-10-05T08:00:00Z',
    end: '2026-11-05T08:00:00Z',
  },
};

const mockFailedInvoice: Invoice = {
  ...mockPendingInvoice,
  status: 'failed',
};

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      getInvoice: vi.fn(),
      getInvoiceByOrder: vi.fn(),
      listInvoices: vi.fn(),
    },
  };
});

vi.mock('../../api/billing', () => ({
  billingApi: {
    getReceipt: vi.fn().mockResolvedValue({
      invoice_id: 'inv-123',
      receipt_number: 'KUS-2026-000001',
      download_url: 'https://storage.googleapis.com/test/receipt.pdf',
    }),
  },
}));

vi.mock('../../analytics', () => ({
  pushAnalyticsEvent: vi.fn(),
}));

import { api } from '../../api/client';
import { billingApi } from '../../api/billing';
import { pushAnalyticsEvent } from '../../analytics';

const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('BillPage', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      ...originalLocation,
      pathname: '/billing/success',
      search: '?orderCode=100200',
    };
    window.open = vi.fn();
    window.print = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it('resolves invoice by orderCode and renders paid bill details directly when already paid', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue(mockPaidInvoice);

    wrap(<BillPage />);

    await waitFor(() => {
      expect(api.getInvoiceByOrder).toHaveBeenCalledWith('100200');
    });

    // Check header and numbers
    expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument();
    expect(screen.getByText(/#100200/)).toBeInTheDocument();

    // Check sender info
    expect(screen.getByText('TRAN VAN TEST')).toBeInTheDocument();
    expect(screen.getByText('••••5678')).toBeInTheDocument();
    expect(screen.getByText('FT100200')).toBeInTheDocument();

    // Check amount
    expect(screen.getAllByText(/299.000/).length).toBeGreaterThan(0);

    // Verify analytics pushed once
    expect(pushAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(pushAnalyticsEvent).toHaveBeenCalledWith('purchase', {
      transaction_id: '100200',
      value: 299000,
      currency: 'VND',
      plan_code: 'basic',
    });
    expect(sessionStorage.getItem('kusshoes_purchase_pushed_100200')).toBe('1');
  });

  it('polls pending invoice until paid, then transitions to bill and pushes analytics once', async () => {
    vi.useFakeTimers();
    try {
      m(api.getInvoiceByOrder)
        .mockResolvedValueOnce(mockPendingInvoice)
        .mockResolvedValueOnce(mockPaidInvoice);

      wrap(<BillPage />);

      // First check runs immediately
      await vi.advanceTimersByTimeAsync(50);
      expect(api.getInvoiceByOrder).toHaveBeenCalledTimes(1);

      // Advance 3s for the next polling tick
      await vi.advanceTimersByTimeAsync(3100);
      expect(api.getInvoiceByOrder).toHaveBeenCalledTimes(2);

      expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument();
      expect(pushAnalyticsEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles failed state when invoice returns failed status', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue(mockFailedInvoice);

    wrap(<BillPage />);

    await waitFor(() => {
      expect(screen.getByText(/thanh toán không thành công|payment failed/i)).toBeInTheDocument();
    });

    // Analytics should NOT be pushed for failed payment
    expect(pushAnalyticsEvent).not.toHaveBeenCalled();
  });

  it('downloads PDF and prints invoice via buttons', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue(mockPaidInvoice);

    wrap(<BillPage />);

    await waitFor(() => {
      expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /tải hoá đơn pdf|download pdf receipt/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(billingApi.getReceipt).toHaveBeenCalledWith('inv-123');
      expect(window.open).toHaveBeenCalledWith('https://storage.googleapis.com/test/receipt.pdf', '_blank', 'noopener');
    });

    const printBtn = screen.getByRole('button', { name: /^print$|^in$/i });
    fireEvent.click(printBtn);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  const setLocation = (pathname: string, search = '') => {
    (window as unknown as { location: unknown }).location = { ...originalLocation, pathname, search };
  };

  it('labels a yearly plan with its own cycle, not monthly', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue({ ...mockPaidInvoice, plan_tier: 'pro', billing_cycle: 'yearly' });

    wrap(<BillPage />);

    await waitFor(() => expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument());
    expect(screen.getAllByText(/Pro.*(yearly|năm)/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/monthly|tháng/i)).not.toBeInTheDocument();
  });

  it('labels a Credit invoice by its Credit count instead of as a plan', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue({
      ...mockPaidInvoice,
      plan_tier: 'credit',
      billing_cycle: 'one_time',
      credit_quantity: 3,
      subscription_period: null,
    });

    wrap(<BillPage />);

    await waitFor(() => expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument());
    expect(screen.getAllByText(/3 (scan credits|lượt quét)/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Credit Plan|Gói Credit/i)).not.toBeInTheDocument();
  });

  it('shows listed price and the coupon discount before the total', async () => {
    m(api.getInvoiceByOrder).mockResolvedValue({
      ...mockPaidInvoice,
      listed_price_vnd: 299000,
      discount_vnd: 59800,
      amount_vnd: 239200,
      coupon_code: 'SAVE20',
    });

    wrap(<BillPage />);

    await waitFor(() => expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument());
    expect(screen.getByText(/299.000/)).toBeInTheDocument();
    expect(screen.getByText(/SAVE20/)).toBeInTheDocument();
    expect(screen.getByText(/-\s*59.800/)).toBeInTheDocument();
    expect(screen.getByText(/239.200/)).toBeInTheDocument();
  });

  it('does not push a purchase event when an old paid bill is opened from history', async () => {
    setLocation('/billing/invoices/inv-123');
    m(api.getInvoice).mockResolvedValue(mockPaidInvoice);

    wrap(<BillPage />);

    await waitFor(() => expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument());
    expect(api.getInvoice).toHaveBeenCalledWith('inv-123');
    expect(pushAnalyticsEvent).not.toHaveBeenCalled();
  });

  it('shows a refunded invoice from history as a refunded bill without polling', async () => {
    vi.useFakeTimers();
    try {
      setLocation('/billing/invoices/inv-123');
      m(api.getInvoice).mockResolvedValue({ ...mockPaidInvoice, status: 'refunded' });

      wrap(<BillPage />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });

      expect(screen.getByText(/refunded|hoàn tiền/i)).toBeInTheDocument();
      expect(screen.getByText('KUS-2026-000001')).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(api.getInvoice).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a pending invoice from history as not paid yet without polling', async () => {
    vi.useFakeTimers();
    try {
      setLocation('/billing/invoices/inv-123');
      m(api.getInvoice).mockResolvedValue(mockPendingInvoice);

      wrap(<BillPage />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });

      expect(screen.getByText(/not completed yet|chưa được thanh toán/i)).toBeInTheDocument();
      expect(screen.queryByText(/checking payment|đang kiểm tra/i)).not.toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(api.getInvoice).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling after unmount, even while the first request is in flight', async () => {
    vi.useFakeTimers();
    try {
      let resolveFirst: (value: Invoice) => void = () => {};
      m(api.getInvoiceByOrder)
        .mockImplementationOnce(() => new Promise<Invoice>((resolve) => { resolveFirst = resolve; }))
        .mockResolvedValue(mockPendingInvoice);

      const { unmount } = wrap(<BillPage />);
      unmount();
      resolveFirst(mockPendingInvoice);

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(api.getInvoiceByOrder).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends "Try again" back to the review page for the same plan', async () => {
    const navigate = vi.fn();
    m(api.getInvoiceByOrder).mockResolvedValue({ ...mockFailedInvoice, billing_cycle: 'yearly', coupon_code: 'SAVE20' });

    wrap(<BillPage navigate={navigate} />);

    const retry = await screen.findByRole('button', { name: /try again|thử thanh toán lại/i });
    fireEvent.click(retry);
    const path = navigate.mock.calls[0][0] as string;
    expect(path.startsWith('/billing/checkout?')).toBe(true);
    const params = new URLSearchParams(path.split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({
      type: 'plan',
      tier: 'basic',
      cycle: 'yearly',
      coupon: 'SAVE20',
      gateway: 'payos',
    });
  });
});
