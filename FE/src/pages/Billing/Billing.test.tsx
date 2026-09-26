import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  },
}));

import { api } from '../../api/client';
import { billingApi } from '../../api/billing';
import { Billing } from './Billing';

const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Billing - MoMo credit purchase (SUB_GATEWAY_COMING_SOON)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('disables the "Pay via MoMo" credit button with a Coming Soon label', async () => {
    m(api.listPlans).mockResolvedValue([]);
    m(api.subscription).mockResolvedValue({
      id: 'sub-1',
      tier: 'basic',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: null,
      cancel_at_period_end: false,
    });
    m(api.listInvoices).mockResolvedValue([]);
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

    wrap(<Billing />);

    const buyCreditBtn = await screen.findByRole('button', { name: /buy credit/i });
    fireEvent.click(buyCreditBtn);

    const momoBtn = await screen.findByRole('button', { name: /momo \(coming soon\)/i });
    expect(momoBtn).toBeDisabled();
    expect(momoBtn).toHaveAttribute('title', expect.stringMatching(/coming soon/i));

    fireEvent.click(momoBtn);
    expect(billingApi.createCreditCheckout).not.toHaveBeenCalled();
  });
});
