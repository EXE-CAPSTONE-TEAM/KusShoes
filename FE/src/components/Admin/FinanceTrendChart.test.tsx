import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FinancePoint } from '../../types/admin';
import { FinanceTrendChart, formatPeriodLabel } from './FinanceTrendChart';

const pt = (period_start: string, revenue: number, api: number, maint: number): FinancePoint => ({
  period_start,
  revenue_vnd: revenue,
  api_cost_vnd: api,
  maintenance_cost_vnd: maint,
  profit_vnd: revenue - api - maint,
});

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe('FinanceTrendChart', () => {
  it('shows the empty state when every point is zero', () => {
    render(<FinanceTrendChart points={[pt('2026-10-01', 0, 0, 0), pt('2026-10-02', 0, 0, 0)]} granularity="day" />);
    expect(screen.getByText(/Chưa có dữ liệu tài chính/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws a negative profit point below the zero baseline', () => {
    const { container } = render(
      <FinanceTrendChart
        points={[pt('2026-09-01', 1_000_000, 100_000, 200_000), pt('2026-10-01', 0, 300_000, 500_000)]}
        granularity="month"
      />,
    );
    const baselineY = num(screen.getByTestId('zero-baseline'), 'y1');
    const circles = container.querySelectorAll('circle');
    expect(num(circles[0], 'cy')).toBeLessThan(baselineY);
    expect(num(circles[1], 'cy')).toBeGreaterThan(baselineY);
  });

  it('scales bar height with revenue', () => {
    render(<FinanceTrendChart points={[pt('2026-10-01', 1_000_000, 0, 0), pt('2026-10-02', 4_000_000, 0, 0)]} granularity="day" />);
    const bars = screen.getAllByTestId('revenue-bar');
    expect(num(bars[1], 'height')).toBeGreaterThan(num(bars[0], 'height'));
  });

  it('reveals revenue, cost split and profit in the tooltip on hover', () => {
    render(<FinanceTrendChart points={[pt('2026-10-01', 2_000_000, 500_000, 0)]} granularity="day" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('finance-slot'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Doanh thu: 2.0 tr');
    expect(tip).toHaveTextContent('Chi phí API: 500k');
    expect(tip).toHaveTextContent('Lợi nhuận: 1.5 tr');
  });

  it('formats x labels as dd/MM for days and T{m} for months', () => {
    expect(formatPeriodLabel('2026-03-07', 'day')).toBe('07/03');
    expect(formatPeriodLabel('2026-03-01', 'month')).toBe('T3');
    expect(formatPeriodLabel('2026-12-01', 'month')).toBe('T12');
  });
});
