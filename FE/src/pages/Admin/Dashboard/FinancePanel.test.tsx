import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceOverview, FinanceTotals } from '../../../types/admin';

const { finance } = vi.hoisted(() => ({ finance: vi.fn() }));

vi.mock('../../../api/adminClient', () => {
  class AdminApiError extends Error {
    status: number;
    constructor(_code: string, message: string, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return { AdminApiError, adminDashboard: { finance } };
});

import { AdminApiError } from '../../../api/adminClient';
import { FinancePanel } from './FinancePanel';

const totals = (over: Partial<FinanceTotals> = {}): FinanceTotals => ({
  revenue_vnd: 0,
  api_cost_vnd: 0,
  maintenance_cost_vnd: 0,
  total_cost_vnd: 0,
  profit_vnd: 0,
  contribution_margin_vnd: 0,
  contribution_margin_rate: null,
  profit_margin_rate: null,
  ...over,
});

const overview = (over: Partial<FinanceOverview> = {}): FinanceOverview => ({
  as_of: '2026-10-12T00:00:00Z',
  since: '2026-01-05',
  totals: totals({ revenue_vnd: 5_000_000, profit_vnd: 3_000_000, contribution_margin_rate: 0.8 }),
  current_month: totals({ revenue_vnd: 1_000_000, total_cost_vnd: 400_000, api_cost_vnd: 150_000, contribution_margin_rate: 0.5 }),
  maintenance: { configured: true, monthly_vnd: 250_000 },
  series_1m: [{ period_start: '2026-10-11', revenue_vnd: 1, api_cost_vnd: 0, maintenance_cost_vnd: 0, profit_vnd: 1 }],
  series_6m: [{ period_start: '2026-10-01', revenue_vnd: 2, api_cost_vnd: 0, maintenance_cost_vnd: 0, profit_vnd: 2 }],
  ...over,
});

describe('FinancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the four finance cards from the response', async () => {
    finance.mockResolvedValue(overview());
    render(<FinancePanel />);
    await waitFor(() => expect(screen.getByText(/5\.000\.000 VNĐ/)).toBeInTheDocument());
    expect(screen.getByText('Tổng doanh thu')).toBeInTheDocument();
    expect(screen.getByText('Tổng lợi nhuận')).toBeInTheDocument();
    expect(screen.getByText('Chi phí duy trì website/API')).toBeInTheDocument();
    expect(screen.getByText('Tỷ suất lợi nhuận biên')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText(/Từ 05\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Cố định: 250\.000 VNĐ\/tháng/)).toBeInTheDocument();
  });

  it('shows a dash for the margin and an unconfigured note when data is missing', async () => {
    finance.mockResolvedValue(
      overview({
        since: null,
        totals: totals(),
        current_month: totals(),
        maintenance: { configured: false, monthly_vnd: null },
      }),
    );
    render(<FinancePanel />);
    await waitFor(() => expect(screen.getByText(/Chưa cấu hình chi phí cố định/)).toBeInTheDocument());
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Từ /)).toBeNull();
  });

  it('shows the unsupported message on a 404 and hides the cards', async () => {
    finance.mockRejectedValue(new AdminApiError('HTTP_404', 'Not Found', 404));
    render(<FinancePanel />);
    await waitFor(() => expect(screen.getByText('Máy chủ chưa hỗ trợ dữ liệu tài chính')).toBeInTheDocument());
    expect(screen.queryByText('Tổng doanh thu')).toBeNull();
  });

  it('shows a retry action on other failures and refetches', async () => {
    finance.mockRejectedValueOnce(new AdminApiError('HTTP_500', 'boom', 500));
    finance.mockResolvedValueOnce(overview());
    render(<FinancePanel />);
    fireEvent.click(await screen.findByText('Thử lại'));
    await waitFor(() => expect(screen.getByText('Tổng doanh thu')).toBeInTheDocument());
    expect(finance).toHaveBeenCalledTimes(2);
  });

  it('switches the chart between the 1-month and 6-month series', async () => {
    finance.mockResolvedValue(overview());
    const { container } = render(<FinancePanel />);
    await waitFor(() => expect(screen.getByText('6 tháng')).toBeInTheDocument());
    // 1m series has a single day point labelled dd/MM; 6m is labelled T{m}
    expect(container.textContent).toContain('11/10');
    fireEvent.click(screen.getByText('6 tháng'));
    expect(container.textContent).toContain('T10');
  });

  it('navigates to analytics from the detail link', async () => {
    finance.mockResolvedValue(overview());
    const navigate = vi.fn();
    render(<FinancePanel navigate={navigate} />);
    fireEvent.click(await screen.findByText('Phân tích chi tiết →'));
    expect(navigate).toHaveBeenCalledWith('analytics');
  });

  it('refetches when refreshKey changes', async () => {
    finance.mockResolvedValue(overview());
    const { rerender } = render(<FinancePanel refreshKey={0} />);
    await waitFor(() => expect(finance).toHaveBeenCalledTimes(1));
    rerender(<FinancePanel refreshKey={1} />);
    await waitFor(() => expect(finance).toHaveBeenCalledTimes(2));
  });
});
