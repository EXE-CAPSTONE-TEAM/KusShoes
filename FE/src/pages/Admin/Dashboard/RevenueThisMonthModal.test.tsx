import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminInvoice } from '../../../types/admin';

const { revenueThisMonth, invoices } = vi.hoisted(() => ({
  revenueThisMonth: vi.fn(),
  invoices: vi.fn(),
}));

vi.mock('../../../api/adminClient', () => {
  class AdminApiError extends Error {
    status: number;
    constructor(_code: string, message: string, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return {
    AdminApiError,
    adminDashboard: { revenueThisMonth },
    adminBilling: { invoices, invoice: vi.fn() },
  };
});

import { AdminApiError } from '../../../api/adminClient';
import { RevenueThisMonthModal } from './RevenueThisMonthModal';

const makeInvoice = (id: string, paidAt: string, amount: number): AdminInvoice =>
  ({
    id,
    order_code: Number(id),
    user_email: `user${id}@example.com`,
    plan_tier: 'pro',
    billing_cycle: 'monthly',
    payment_method: 'payos',
    amount_vnd: amount,
    status: 'paid',
    paid_at: paidAt,
    created_at: paidAt,
  }) as unknown as AdminInvoice;

describe('RevenueThisMonthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the invoices from the dedicated endpoint', async () => {
    revenueThisMonth.mockResolvedValue([makeInvoice('1', new Date().toISOString(), 649000)]);
    render(<RevenueThisMonthModal total={649000} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('user1@example.com')).toBeInTheDocument());
    expect(invoices).not.toHaveBeenCalled();
  });

  it('falls back to the invoice list when the server has no dedicated endpoint', async () => {
    revenueThisMonth.mockRejectedValue(new AdminApiError('HTTP_404', 'Not Found', 404));
    const lastYear = new Date();
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
    invoices.mockResolvedValue({
      items: [
        makeInvoice('2', new Date().toISOString(), 259000),
        makeInvoice('3', lastYear.toISOString(), 111000),
      ],
      next_cursor: null,
    });
    render(<RevenueThisMonthModal total={259000} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());
    expect(screen.queryByText('user3@example.com')).not.toBeInTheDocument();
    expect(invoices).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
  });
});
