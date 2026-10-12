import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportCatalogue, ReportSpec } from '../../../types/admin';

const { catalogue, download, toast } = vi.hoisted(() => ({
  catalogue: vi.fn(),
  download: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../../api/adminClient', () => {
  class AdminApiError extends Error {
    status: number;
    constructor(_code: string, message: string, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return { AdminApiError, adminReports: { catalogue, download } };
});
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

import { AdminApiError } from '../../../api/adminClient';
import { AdminReports } from './AdminReports';

const spec = (over: Partial<ReportSpec> = {}): ReportSpec => ({
  id: 'transactions',
  title: 'Sổ giao dịch',
  description: 'Danh sách giao dịch',
  formats: ['csv', 'xlsx'],
  date_scoped: true,
  sensitive: false,
  locked: false,
  max_range_days: 366,
  columns: [{ label: 'Mã giao dịch', kind: 'text' }],
  ...over,
});

const data = (): ReportCatalogue => ({
  max_rows: 50000,
  domains: [
    { key: 'tai-chinh', label: 'Tài chính', reports: [spec(), spec({ id: 'revenue', title: 'Doanh thu', formats: ['csv', 'xlsx', 'pdf'] })] },
    {
      key: 'goi-thanh-toan',
      label: 'Gói thanh toán',
      reports: [spec({ id: 'unpaid-invoices', title: 'Hóa đơn chưa thanh toán', date_scoped: false, max_range_days: 0 })],
    },
    {
      key: 'nguoi-dung',
      label: 'Người dùng',
      reports: [spec({ id: 'users', title: 'Danh sách người dùng', sensitive: true, locked: false })],
    },
  ],
});

describe('AdminReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogue.mockResolvedValue(data());
  });

  it('groups reports by domain from the server catalogue and only offers allowed formats', async () => {
    render(<AdminReports />);
    expect(await screen.findByRole('heading', { name: 'Tài chính' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gói thanh toán' })).toBeTruthy();
    const revenue = within(screen.getByTestId('report-revenue'));
    expect(revenue.getByRole('button', { name: 'PDF' })).toBeTruthy();
    const tx = within(screen.getByTestId('report-transactions'));
    expect(tx.queryByRole('button', { name: 'PDF' })).toBeNull();
    expect(tx.getByText('Mã giao dịch')).toBeTruthy();
  });

  it('disables the date range when only snapshot reports are visible', async () => {
    render(<AdminReports />);
    await screen.findByRole('heading', { name: 'Tài chính' });
    const from = screen.getByLabelText('Từ ngày') as HTMLInputElement;
    expect(from.disabled).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: /Gói thanh toán/ }));
    expect(from.disabled).toBe(true);
    expect((screen.getByRole('button', { name: '7 ngày' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables only the clicked button while downloading and sends the range', async () => {
    let finish: () => void = () => {};
    download.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    render(<AdminReports />);
    const tx = within(await screen.findByTestId('report-transactions'));
    fireEvent.click(tx.getByRole('button', { name: 'CSV' }));
    const busy = await tx.findByRole('button', { name: 'Đang tạo...' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect((tx.getByRole('button', { name: 'Excel' }) as HTMLButtonElement).disabled).toBe(false);
    expect(download).toHaveBeenCalledWith(
      'transactions',
      'csv',
      expect.objectContaining({ date_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
    finish();
    await waitFor(() => expect(tx.getByRole('button', { name: 'CSV' })).toBeTruthy());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Sổ giao dịch'), 'success');
  });

  it('shows the server message in an error toast when the download fails', async () => {
    download.mockRejectedValue(new AdminApiError('report_too_large', 'Báo cáo vượt quá giới hạn dòng.', 422));
    render(<AdminReports />);
    const tx = within(await screen.findByTestId('report-transactions'));
    fireEvent.click(tx.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Báo cáo vượt quá giới hạn dòng.', 'error'));
  });

  it('marks sensitive reports locked for staff and blocks every format button', async () => {
    const c = data();
    c.domains[2].reports[0] = spec({ id: 'users', title: 'Danh sách người dùng', sensitive: true, locked: true });
    catalogue.mockResolvedValue(c);
    render(<AdminReports />);
    const users = within(await screen.findByTestId('report-users'));
    expect(users.getByText(/Bị khóa/)).toBeTruthy();
    for (const b of users.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  it('shows the admin badge (not locked) for admins and filters by search', async () => {
    render(<AdminReports />);
    const users = within(await screen.findByTestId('report-users'));
    expect(users.getByText('Chỉ admin')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tìm báo cáo'), { target: { value: 'doanh thu' } });
    expect(screen.queryByTestId('report-users')).toBeNull();
    expect(screen.getByTestId('report-revenue')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tìm báo cáo'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Không tìm thấy báo cáo phù hợp.')).toBeTruthy();
  });

  it('shows an error state with retry when the catalogue fails', async () => {
    catalogue.mockRejectedValueOnce(new AdminApiError('forbidden', 'Không có quyền.', 403));
    render(<AdminReports />);
    expect(await screen.findByText('Không có quyền.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    expect(await screen.findByRole('heading', { name: 'Tài chính' })).toBeTruthy();
  });

  it('shows the empty state for an empty catalogue', async () => {
    catalogue.mockResolvedValue({ max_rows: 1, domains: [] });
    render(<AdminReports />);
    expect(await screen.findByText('Chưa có báo cáo nào khả dụng.')).toBeTruthy();
  });
});
