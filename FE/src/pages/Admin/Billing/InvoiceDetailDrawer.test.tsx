import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';
import type { AdminInvoice } from '../../../types/admin';

const mockFullInvoice: AdminInvoice = {
  id: 'inv-123',
  user_id: 'usr-456',
  user_email: 'customer@example.com',
  order_code: 998877,
  plan_tier: 'basic',
  billing_cycle: 'monthly',
  listed_price_vnd: 299000,
  discount_vnd: 50000,
  amount_vnd: 249000,
  payment_method: 'payos',
  status: 'paid',
  payment_reference: 'REF9988',
  receipt_number: 'KUS-00123',
  coupon_code: 'SAVE50K',
  is_manual: false,
  paid_at: '2026-10-05T08:00:00Z',
  created_at: '2026-10-05T07:55:00Z',
  vat: {
    enabled: true,
    rate_percent: 8,
    vat_vnd: 18444,
    net_vnd: 230556,
  },
  transfer: {
    transferred_at: '2026-10-05T07:59:00Z',
    sender_name: 'NGUYEN VAN TEST',
    sender_account_number: '1234567890',
    sender_bank_id: '970422',
    sender_bank_name: 'MBBank',
    receiver_account_number: '88889999',
    virtual_account_name: 'KUSSHOES',
    virtual_account_number: 'VA123',
    bank_reference: 'FT9988',
    payment_link_id: 'pl_test123',
    transfer_description: 'KusShoes basic monthly',
    currency: 'VND',
  },
};

const mockNullTransferInvoice: AdminInvoice = {
  ...mockFullInvoice,
  order_code: 112233,
  transfer: null,
};

describe('InvoiceDetailDrawer', () => {
  it('renders with a full payload including order details and transfer details', () => {
    const handleClose = vi.fn();
    render(<InvoiceDetailDrawer invoice={mockFullInvoice} onClose={handleClose} />);

    expect(screen.getByText('Hóa đơn #998877')).toBeInTheDocument();
    expect(screen.getByTestId('order-code')).toHaveTextContent('998877');
    expect(screen.getByText('KUS-00123')).toBeInTheDocument();
    expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN VAN TEST')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('MBBank (970422)')).toBeInTheDocument();
    expect(screen.getByText('FT9988')).toBeInTheDocument();
    expect(screen.getByText('SAVE50K')).toBeInTheDocument();
  });

  it('renders gracefully with null transfer details showing empty state note', () => {
    const handleClose = vi.fn();
    render(<InvoiceDetailDrawer invoice={mockNullTransferInvoice} onClose={handleClose} />);

    expect(screen.getByText('Hóa đơn #112233')).toBeInTheDocument();
    expect(
      screen.getByText('Cổng thanh toán không gửi thông tin người chuyển'),
    ).toBeInTheDocument();
  });

  it('renders manual details when is_manual is true', () => {
    const manualInvoice: AdminInvoice = {
      ...mockFullInvoice,
      is_manual: true,
      collected_by: 'Staff A',
      created_by: 'admin-1',
      approved_by: 'admin-2',
    };
    render(<InvoiceDetailDrawer invoice={manualInvoice} onClose={vi.fn()} />);

    expect(screen.getByText('3. Thủ công')).toBeInTheDocument();
    expect(screen.getByText('Staff A')).toBeInTheDocument();
    expect(screen.getByText('admin-1')).toBeInTheDocument();
    expect(screen.getByText('admin-2')).toBeInTheDocument();
  });

  it('triggers onClose when close button or overlay is clicked', () => {
    const handleClose = vi.fn();
    render(<InvoiceDetailDrawer invoice={mockFullInvoice} onClose={handleClose} />);

    fireEvent.click(screen.getByLabelText('Đóng chi tiết'));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('invoice-drawer-overlay'));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
