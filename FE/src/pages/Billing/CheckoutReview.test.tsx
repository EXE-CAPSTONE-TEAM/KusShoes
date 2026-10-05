import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { CheckoutReview } from './CheckoutReview';
import { ApiError, type CheckoutQuote, type CreditQuote, type UserProfile } from '../../api/client';

const mockProfile: UserProfile = {
  id: 'usr-1',
  account_code: 'ACC-001',
  email: 'tester@kusshoes.com',
  first_name: 'Van',
  last_name: 'Nguyen',
  username: 'vnguyen',
  avatar_path: null,
  phone_number: null,
  bio: null,
  language: 'vi',
  preferred_styles: [],
  designer_role: null,
  studio_name: null,
  studio_location: null,
  instagram_handle: null,
  behance_username: null,
  tiktok_handle: null,
  status: 'active',
  member_since: '2026-01-01T00:00:00Z',
  total_designs: 5,
};

const mockPlanQuote: CheckoutQuote = {
  plan: {
    tier: 'basic',
    billing_cycle: 'monthly',
    price_vnd: 299000,
    max_projects: 10,
    max_exports_per_month: 20,
    max_scans_per_cycle: null,
    max_ai_credits_per_cycle: null,
  },
  listed_price_vnd: 299000,
  discount_vnd: 50000,
  discount_reason: 'coupon',
  coupon_code: 'DISCOUNT50',
  amount_vnd: 249000,
  vat: {
    enabled: true,
    rate_percent: 8,
    vat_vnd: 18444,
    net_vnd: 230556,
  },
  is_upgrade: false,
  current_tier: 'free',
  new_period_start: '2026-10-05T08:00:00Z',
  new_expires_at: '2026-11-05T08:00:00Z',
  buyer: {
    full_name: 'Van Nguyen',
    email: 'tester@kusshoes.com',
  },
};

const mockCreditQuote: CreditQuote = {
  quantity: 2,
  unit_price_vnd: 20000,
  total_vnd: 40000,
  amount_vnd: 40000,
  vat: {
    enabled: true,
    rate_percent: 8,
    vat_vnd: 2963,
    net_vnd: 37037,
  },
  can_purchase: true,
};

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      profile: vi.fn(),
      quoteCheckout: vi.fn(),
      createCheckout: vi.fn(),
    },
  };
});

vi.mock('../../api/billing', () => ({
  billingApi: {
    getPaymentGateways: vi.fn().mockResolvedValue({ payos: true, momo: true }),
    quoteCredits: vi.fn(),
    createCreditCheckout: vi.fn(),
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

describe('CheckoutReview Page', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    m(api.profile).mockResolvedValue(mockProfile);
    m(api.quoteCheckout).mockResolvedValue(mockPlanQuote);
    m(api.createCheckout).mockResolvedValue('https://pay.payos.vn/web/test-link');
    m(billingApi.quoteCredits).mockResolvedValue(mockCreditQuote);
    m(billingApi.createCreditCheckout).mockResolvedValue('https://pay.payos.vn/web/credit-link');

    // Setup window.location mock
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      ...originalLocation,
      search: '?type=plan&tier=basic&cycle=monthly&coupon=DISCOUNT50',
      assign: vi.fn(),
    };
  });

  afterEach(() => {
    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it('renders buyer info, plan details, pricing table, and disabled confirm button', async () => {
    wrap(<CheckoutReview />);

    // Buyer info
    await waitFor(() => {
      expect(screen.getByText('Van Nguyen')).toBeInTheDocument();
      expect(screen.getByText('tester@kusshoes.com')).toBeInTheDocument();
    });

    // Plan & features
    expect(screen.getByText(/BASIC/i)).toBeInTheDocument();

    // Price table
    expect(screen.getByText(/299.000/)).toBeInTheDocument();
    expect(screen.getByText(/-50.000/)).toBeInTheDocument();
    expect(screen.getByText(/249.000/)).toBeInTheDocument();

    // Confirm button is initially disabled
    const confirmBtn = screen.getByRole('button', { name: /confirm & pay|xác nhận & thanh toán/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('enables confirm button after terms agreement checkbox is checked, and calls createCheckout once on click', async () => {
    wrap(<CheckoutReview />);

    await waitFor(() => {
      expect(screen.getByText('Van Nguyen')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const confirmBtn = screen.getByRole('button', { name: /confirm & pay|xác nhận & thanh toán/i });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.createCheckout).toHaveBeenCalledWith('basic', 'monthly', 'payos', 'DISCOUNT50');
      expect(pushAnalyticsEvent).toHaveBeenCalledWith('begin_checkout', {
        plan_code: 'basic_monthly',
        value: 249000,
        currency: 'VND',
      });
      expect(sessionStorage.getItem('kusshoes_last_checkout')).toContain('"value":249000');
      expect(window.location.assign).toHaveBeenCalledWith('https://pay.payos.vn/web/test-link');
    });
  });

  it('renders 409 already active state and provides back button to /billing', async () => {
    const error409 = new ApiError('Plan already active', 409, 'SUBSCRIPTION_ALREADY_ACTIVE');
    m(api.quoteCheckout).mockRejectedValue(error409);

    const mockNavigate = vi.fn();
    wrap(<CheckoutReview navigate={mockNavigate} />);

    await waitFor(() => {
      const msgs = screen.getAllByText(/Bạn đang có gói này đang hoạt động|already have an active subscription/i);
      expect(msgs.length).toBeGreaterThan(0);
    });

    const backBtn = screen.getAllByRole('button', { name: /back|quay lại/i })[0];
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/billing');
  });

  it('renders credit quote and calls createCreditCheckout on confirm', async () => {
    (window as unknown as { location: unknown }).location = {
      ...originalLocation,
      search: '?type=credit&qty=2&gateway=momo',
      assign: vi.fn(),
    };

    wrap(<CheckoutReview />);

    await waitFor(() => {
      expect(screen.getByText(/2 scan credits|2 lượt quét/i)).toBeInTheDocument();
      expect(screen.getByText(/40.000/)).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const confirmBtn = screen.getByRole('button', { name: /confirm & pay|xác nhận & thanh toán/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(billingApi.createCreditCheckout).toHaveBeenCalledWith(2, 'momo');
      expect(pushAnalyticsEvent).toHaveBeenCalledWith('begin_checkout', {
        plan_code: 'credits_2',
        value: 40000,
        currency: 'VND',
      });
      expect(window.location.assign).toHaveBeenCalledWith('https://pay.payos.vn/web/credit-link');
    });
  });
});
