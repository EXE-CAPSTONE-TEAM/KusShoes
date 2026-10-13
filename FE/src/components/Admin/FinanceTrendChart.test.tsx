import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FinancePoint } from '../../types/admin';
import { FinanceTooltipBody, FinanceTrendChart, formatPeriodLabel } from './FinanceTrendChart';

const pt = (period_start: string, revenue: number, api: number, maint: number): FinancePoint => ({
  period_start,
  revenue_vnd: revenue,
  api_cost_vnd: api,
  maintenance_cost_vnd: maint,
  profit_vnd: revenue - api - maint,
});

describe('FinanceTrendChart', () => {
  it('keeps the chart frame and shows the empty state when every point is zero', () => {
    render(<FinanceTrendChart points={[pt('2026-10-01', 0, 0, 0), pt('2026-10-02', 0, 0, 0)]} granularity="day" />);
    expect(screen.getByText(/Chưa có dữ liệu tài chính/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('offers a way to a longer range from the empty state', () => {
    const onShowLonger = vi.fn();
    render(
      <FinanceTrendChart
        points={[pt('2026-10-01', 0, 0, 0)]}
        granularity="day"
        emptyHint="Dữ liệu bắt đầu từ 23/06/2026."
        onShowLonger={onShowLonger}
        showLongerLabel="Xem 6 tháng →"
      />,
    );
    expect(screen.getByText(/23\/06\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Xem 6 tháng →'));
    expect(onShowLonger).toHaveBeenCalledTimes(1);
  });

  it('hides the empty state when there is data', () => {
    render(<FinanceTrendChart points={[pt('2026-10-01', 1_000_000, 0, 0)]} granularity="day" />);
    expect(screen.queryByText(/Chưa có dữ liệu tài chính/)).toBeNull();
  });

  it('shows revenue, cost split and profit in the tooltip body', () => {
    render(<FinanceTooltipBody point={pt('2026-10-01', 2_000_000, 500_000, 0)} granularity="day" />);
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
