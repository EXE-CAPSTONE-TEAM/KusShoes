import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      listPlans: vi.fn(),
      subscription: vi.fn(),
      listInvoices: vi.fn(),
      usage: vi.fn(),
      profile: vi.fn(),
      createCheckout: vi.fn(),
      cancelSubscription: vi.fn(),
    },
  };
});

vi.mock('../../api/billing', () => ({
  billingApi: {
    previewCoupon: vi.fn(),
    getReceipt: vi.fn(),
    getCreditBalance: vi.fn(),
    getCreditLedger: vi.fn(),
    createCreditCheckout: vi.fn(),
    getPaymentGateways: vi.fn().mockResolvedValue({ payos: true, momo: false }),
  },
}));

import { api, type Invoice as ApiInvoice } from '../../api/client';
import { billingApi } from '../../api/billing';
import { Billing } from './Billing';

const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Billing - Payment Transparency & Navigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const seedActiveBasic = (invoices: ApiInvoice[] = []) => {
    m(api.listPlans).mockResolvedValue([
      {
        id: 'plan-basic',
        tier: 'basic',
        price_vnd: 299000,
        billing_cycle: 'monthly',
        bake_priority: 'standard',
        max_projects: 10,
        max_exports_per_month: 20,
        allowed_export_formats: ['glb', 'obj'],
      },
    ]);
    m(api.subscription).mockResolvedValue({
      id: 'sub-1',
      tier: 'basic',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: null,
      cancel_at_period_end: false,
    });
    m(api.listInvoices).mockResolvedValue(invoices);
    m(api.usage).mockResolvedValue({
      tier: 'basic',
      max_projects: 10,
      max_exports_per_month: 10,
      projects_count: 1,
      exports_count: 1,
      ai_credits_used: 1,
      ai_credits_limit: 100,
    });
    m(api.profile).mockResolvedValue({
      id: 'user-1',
      account_code: 'ACC-1',
      email: 'user@example.com',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      avatar_path: null,
      phone_number: null,
      bio: null,
      language: 'en',
      preferred_styles: [],
      status: 'active',
      member_since: new Date().toISOString(),
      total_designs: 0,
    });
    m(billingApi.getCreditBalance).mockResolvedValue({
      available: 5,
      used: 0,
      expired: 0,
      purchased_this_cycle: 1,
      max_per_cycle: 3,
      price_vnd: 20000,
      next_expires_at: null,
      can_purchase: true,
      cycle_start: new Date().toISOString(),
    });
    m(billingApi.getCreditLedger).mockResolvedValue({ items: [], next_cursor: null, has_next: false });
  };

  it('disables the "Pay via MoMo" credit button with a Coming Soon label', async () => {
    seedActiveBasic();
    m(billingApi.getPaymentGateways).mockResolvedValue({ payos: true, momo: false });
    wrap(<Billing />);

    const buyCreditBtn = await screen.findByRole('button', { name: /buy credit/i });
    fireEvent.click(buyCreditBtn);

    const momoBtn = await screen.findByRole('button', { name: /momo \(coming soon\)/i });
    expect(momoBtn).toBeDisabled();
    expect(momoBtn).toHaveAttribute('title', expect.stringMatching(/coming soon/i));

    fireEvent.click(momoBtn);
    expect(billingApi.createCreditCheckout).not.toHaveBeenCalled();
  });

  it('navigates to /billing/checkout when choosing MoMo credit payment', async () => {
    seedActiveBasic();
    m(billingApi.getPaymentGateways).mockResolvedValue({ payos: true, momo: true });
    const mockNavigate = vi.fn();
    wrap(<Billing navigate={mockNavigate} />);

    fireEvent.click(await screen.findByRole('button', { name: /buy credit/i }));
    fireEvent.click(await screen.findByRole('button', { name: /pay via momo/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/billing/checkout?type=credit&qty=1&gateway=momo');
  });

  it('renders upgraded invoice history table and links to bill', async () => {
    const mockInvoices: ApiInvoice[] = [
      {
        id: 'inv-001',
        order_code: 1001,
        plan_tier: 'basic',
        billing_cycle: 'monthly',
        listed_price_vnd: 299000,
        discount_vnd: 0,
        amount_vnd: 299000,
        payment_method: 'payos',
        status: 'paid',
        receipt_number: 'KUS-0001',
        paid_at: '2026-10-05T08:00:00Z',
        created_at: '2026-10-05T07:55:00Z',
        vat: { enabled: true, rate_percent: 8, vat_vnd: 22148, net_vnd: 276852 },
      },
    ];
    seedActiveBasic(mockInvoices);
    const mockNavigate = vi.fn();
    wrap(<Billing navigate={mockNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('KUS-0001')).toBeInTheDocument();
      expect(screen.getByText('PAYOS')).toBeInTheDocument();
    });

    const viewBillBtn = screen.getByRole('button', { name: /view bill|xem hoá đơn/i });
    fireEvent.click(viewBillBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/billing/invoices/inv-001');
  });

  it('labels history rows with each invoice own cycle and Credit count', async () => {
    const base: ApiInvoice = {
      id: 'inv-y',
      order_code: 2001,
      plan_tier: 'pro',
      billing_cycle: 'yearly',
      listed_price_vnd: 2990000,
      discount_vnd: 0,
      amount_vnd: 2990000,
      payment_method: 'payos',
      status: 'paid',
      receipt_number: 'KUS-0101',
      paid_at: '2026-10-05T08:00:00Z',
      created_at: '2026-10-05T07:55:00Z',
      vat: { enabled: false, rate_percent: 0, vat_vnd: 0, net_vnd: 2990000 },
    };
    seedActiveBasic([
      base,
      { ...base, id: 'inv-c', order_code: 2002, receipt_number: 'KUS-0102', plan_tier: 'credit', billing_cycle: 'one_time', credit_quantity: 3 },
    ]);
    wrap(<Billing />);

    await waitFor(() => expect(screen.getByText('KUS-0101')).toBeInTheDocument());
    expect(screen.getByText(/^Pro Plan \((yearly|năm)\)$|^Gói Pro \((yearly|năm)\)$/)).toBeInTheDocument();
    expect(screen.getByText(/^3 (scan credits|lượt quét scan)$/)).toBeInTheDocument();
  });

  it('paginates invoice history with Load more button', async () => {
    // Generate 20 invoices to trigger hasMore
    const mock20Invoices: ApiInvoice[] = Array.from({ length: 20 }, (_, i) => ({
      id: `inv-${i + 1}`,
      order_code: 1000 + i,
      plan_tier: 'basic',
      billing_cycle: 'monthly',
      listed_price_vnd: 299000,
      discount_vnd: 0,
      amount_vnd: 299000,
      payment_method: 'payos',
      status: 'paid',
      receipt_number: `KUS-00${i + 1}`,
      paid_at: '2026-10-05T08:00:00Z',
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      vat: { enabled: true, rate_percent: 8, vat_vnd: 22148, net_vnd: 276852 },
    }));

    const mockNextInvoice: ApiInvoice = {
      id: 'inv-21',
      order_code: 1021,
      plan_tier: 'basic',
      billing_cycle: 'monthly',
      listed_price_vnd: 299000,
      discount_vnd: 0,
      amount_vnd: 299000,
      payment_method: 'payos',
      status: 'paid',
      receipt_number: 'KUS-0021',
      paid_at: '2026-10-05T08:00:00Z',
      created_at: new Date(Date.now() - 21 * 60000).toISOString(),
      vat: { enabled: true, rate_percent: 8, vat_vnd: 22148, net_vnd: 276852 },
    };

    seedActiveBasic(mock20Invoices);
    wrap(<Billing />);

    const loadMoreBtn = await screen.findByRole('button', { name: /load more|xem thêm/i });
    expect(loadMoreBtn).toBeInTheDocument();

    m(api.listInvoices).mockResolvedValueOnce([mockNextInvoice]);
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(api.listInvoices).toHaveBeenCalledWith({
        before: mock20Invoices[19].created_at,
        before_id: 'inv-20',
        limit: 20,
      });
      expect(screen.getByText('KUS-0021')).toBeInTheDocument();
    });
  });
});
