import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  buildInvoiceQuery,
  countActiveFilters,
  validateFilters,
  type TransactionFilters,
} from './transactionFilters';

const withFilters = (patch: Partial<TransactionFilters>): TransactionFilters => ({ ...DEFAULT_FILTERS, ...patch });

describe('transactionFilters', () => {
  it('sends an empty query when no filter is set', () => {
    expect(buildInvoiceQuery(DEFAULT_FILTERS)).toEqual({});
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it('maps every filter to its API parameter', () => {
    const query = buildInvoiceQuery(
      withFilters({
        q: '  KUS-001 ',
        status: 'paid',
        paymentMethod: 'momo',
        planTier: 'pro',
        billingCycle: 'yearly',
        minAmount: '100000',
        maxAmount: '500000',
        couponPresence: 'yes',
        couponCode: 'KUS10',
        txType: 'manual',
        upgrade: 'upgrade',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        excludeInternal: true,
      }),
    );
    expect(query).toEqual({
      q: 'KUS-001',
      status: 'paid',
      payment_method: 'momo',
      plan_tier: 'pro',
      billing_cycle: 'yearly',
      min_amount_vnd: 100000,
      max_amount_vnd: 500000,
      has_coupon: true,
      coupon_code: 'KUS10',
      is_manual: true,
      is_upgrade: true,
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      exclude_internal: true,
    });
  });

  it('treats the end date as inclusive by sending the next local midnight', () => {
    const query = buildInvoiceQuery(withFilters({ dateFrom: '2026-10-01', dateTo: '2026-10-03' }));
    const from = new Date(query.date_from!);
    const to = new Date(query.date_to!);
    expect(to.getTime() - from.getTime()).toBe(3 * 86_400_000);
  });

  it('keeps false-valued tri-state filters (has_coupon=false, is_manual=false)', () => {
    const query = buildInvoiceQuery(withFilters({ couponPresence: 'no', txType: 'auto', upgrade: 'new' }));
    expect(query).toMatchObject({ has_coupon: false, is_manual: false, is_upgrade: false });
  });

  it('reports invalid input and omits it from the query', () => {
    const bad = withFilters({
      userId: 'not-a-uuid',
      minAmount: '900',
      maxAmount: '100',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-01',
    });
    expect(Object.keys(validateFilters(bad)).sort()).toEqual(['amount', 'date', 'userId']);
    expect(buildInvoiceQuery(bad)).toEqual({});
  });

  it('rejects negative and fractional amounts', () => {
    expect(validateFilters(withFilters({ minAmount: '-5' })).amount).toBeTruthy();
    expect(validateFilters(withFilters({ maxAmount: '1.5' })).amount).toBeTruthy();
  });

  it('counts only filters that differ from the default', () => {
    expect(countActiveFilters(withFilters({ status: 'paid', q: ' ', excludeInternal: true }))).toBe(2);
  });
});
