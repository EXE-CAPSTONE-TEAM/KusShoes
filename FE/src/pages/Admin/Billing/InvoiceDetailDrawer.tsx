import React, { useEffect, useState } from 'react';
import { X, RotateCw } from 'lucide-react';
import { adminBilling } from '../../../api/adminClient';
import type { AdminInvoice } from '../../../types/admin';
import shared from '../admin-shared.module.css';

interface InvoiceDetailDrawerProps {
  invoice: AdminInvoice | null;
  invoiceId?: string | null;
  onClose: () => void;
}

function formatVnd(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({
  invoice: initialInvoice,
  invoiceId,
  onClose,
}) => {
  const [data, setData] = useState<AdminInvoice | null>(initialInvoice);
  const [loading, setLoading] = useState<boolean>(!initialInvoice && !!invoiceId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(initialInvoice);
    if (!initialInvoice && invoiceId) {
      setLoading(true);
      setError(null);
      adminBilling
        .invoice(invoiceId)
        .then((res) => {
          setData(res);
        })
        .catch((err) => {
          setError(err?.message || 'Không thể tải chi tiết hóa đơn.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [initialInvoice, invoiceId]);

  if (!initialInvoice && !invoiceId) {
    return null;
  }

  const transfer = data?.transfer;
  const hasTransferInfo = Boolean(
    transfer &&
      (transfer.transferred_at ||
        transfer.sender_name ||
        transfer.sender_account_number ||
        transfer.sender_bank_id ||
        transfer.sender_bank_name ||
        transfer.bank_reference ||
        transfer.payment_link_id ||
        transfer.transfer_description),
  );

  return (
    <div className={shared.overlay} onClick={onClose} data-testid="invoice-drawer-overlay">
      <div
        className={shared.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-drawer-title"
      >
        <div className={shared.drawerHeader}>
          <h3 id="invoice-drawer-title" className={shared.drawerTitle}>
            {data ? `Hóa đơn #${data.order_code}` : 'Chi tiết hóa đơn'}
          </h3>
          <button
            className={shared.drawerCloseBtn}
            onClick={onClose}
            aria-label="Đóng chi tiết"
          >
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className={shared.emptyState} style={{ padding: 40 }}>
            Đang tải thông tin hóa đơn...
          </div>
        )}

        {error && (
          <div className={shared.errorState} style={{ margin: 20 }}>
            <span className={shared.errorMessage}>{error}</span>
            {invoiceId && (
              <button
                className={shared.retryBtn}
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  adminBilling
                    .invoice(invoiceId)
                    .then(setData)
                    .catch((err) => setError(err?.message || 'Không thể tải chi tiết hóa đơn.'))
                    .finally(() => setLoading(false));
                }}
              >
                <RotateCw size={14} /> Thử lại
              </button>
            )}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Phần 1: Đơn hàng */}
            <div className={shared.drawerSection}>
              <span className={shared.drawerSectionTitle}>1. Đơn hàng</span>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Mã đơn</span>
                <span className={shared.drawerRowValue} data-testid="order-code">{data.order_code}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Mã biên lai</span>
                <span className={shared.drawerRowValue}>{data.receipt_number || '—'}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Email khách hàng</span>
                <span className={shared.drawerRowValue}>{data.user_email || '—'}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>User ID</span>
                <span className={shared.drawerRowValue} style={{ fontSize: '0.75rem' }}>{data.user_id}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Gói / Chu kỳ</span>
                <span className={shared.drawerRowValue} style={{ textTransform: 'capitalize' }}>
                  {data.plan_tier} ({data.billing_cycle})
                </span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Giá niêm yết</span>
                <span className={shared.drawerRowValue}>{formatVnd(data.listed_price_vnd)}</span>
              </div>
              {data.discount_vnd > 0 && (
                <div className={shared.drawerRow}>
                  <span className={shared.drawerRowLabel}>Giảm giá</span>
                  <span className={shared.drawerRowValue} style={{ color: 'var(--color-success, #10b981)' }}>
                    -{formatVnd(data.discount_vnd)}
                  </span>
                </div>
              )}
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Thực trả</span>
                <span className={shared.drawerRowValue} style={{ fontWeight: 700 }}>
                  {formatVnd(data.amount_vnd)}
                </span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Thuế VAT</span>
                <span className={shared.drawerRowValue}>
                  {data.vat?.enabled
                    ? `${formatVnd(data.vat.vat_vnd)} (${data.vat.rate_percent}%)`
                    : 'Không áp dụng'}
                </span>
              </div>
              {data.coupon_code && (
                <div className={shared.drawerRow}>
                  <span className={shared.drawerRowLabel}>Mã Coupon</span>
                  <span className={shared.drawerRowValue}>{data.coupon_code}</span>
                </div>
              )}
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Trạng thái</span>
                <span className={shared.drawerRowValue}>{data.status}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Thời điểm tạo</span>
                <span className={shared.drawerRowValue}>{formatDateTime(data.created_at)}</span>
              </div>
              <div className={shared.drawerRow}>
                <span className={shared.drawerRowLabel}>Thời điểm hệ thống xác nhận</span>
                <span className={shared.drawerRowValue}>{formatDateTime(data.paid_at)}</span>
              </div>
            </div>

            {/* Phần 2: Chuyển khoản (PayOS webhook) */}
            <div className={shared.drawerSection}>
              <span className={shared.drawerSectionTitle}>2. Chuyển khoản (PayOS webhook)</span>
              {hasTransferInfo ? (
                <>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Thời điểm chuyển khoản (ngân hàng)</span>
                    <span className={shared.drawerRowValue}>{formatDateTime(transfer?.transferred_at)}</span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Người chuyển</span>
                    <span className={shared.drawerRowValue}>{transfer?.sender_name || '—'}</span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Ngân hàng người chuyển</span>
                    <span className={shared.drawerRowValue}>
                      {transfer?.sender_bank_name
                        ? `${transfer.sender_bank_name}${transfer.sender_bank_id ? ` (${transfer.sender_bank_id})` : ''}`
                        : transfer?.sender_bank_id || '—'}
                    </span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Số tài khoản người chuyển</span>
                    <span className={shared.drawerRowValue}>{transfer?.sender_account_number || '—'}</span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Tài khoản nhận</span>
                    <span className={shared.drawerRowValue}>
                      {transfer?.virtual_account_number
                        ? `${transfer.virtual_account_number}${transfer.virtual_account_name ? ` (${transfer.virtual_account_name})` : ''}`
                        : transfer?.receiver_account_number || '—'}
                    </span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Mã tham chiếu ngân hàng</span>
                    <span className={shared.drawerRowValue}>{transfer?.bank_reference || '—'}</span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Payment Link ID</span>
                    <span className={shared.drawerRowValue}>{transfer?.payment_link_id || '—'}</span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Nội dung chuyển khoản</span>
                    <span className={shared.drawerRowValue}>{transfer?.transfer_description || '—'}</span>
                  </div>
                  {transfer?.currency && (
                    <div className={shared.drawerRow}>
                      <span className={shared.drawerRowLabel}>Tiền tệ</span>
                      <span className={shared.drawerRowValue}>{transfer.currency}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className={shared.mutedCell} style={{ fontStyle: 'italic', padding: '8px 0' }}>
                  Cổng thanh toán không gửi thông tin người chuyển
                </div>
              )}
            </div>

            {/* Phần 3: Thủ công (chỉ khi is_manual) */}
            {data.is_manual && (
              <div className={shared.drawerSection}>
                <span className={shared.drawerSectionTitle}>3. Thủ công</span>
                <div className={shared.drawerRow}>
                  <span className={shared.drawerRowLabel}>Người thu</span>
                  <span className={shared.drawerRowValue}>{data.collected_by || '—'}</span>
                </div>
                <div className={shared.drawerRow}>
                  <span className={shared.drawerRowLabel}>Người tạo</span>
                  <span className={shared.drawerRowValue}>{data.created_by || '—'}</span>
                </div>
                <div className={shared.drawerRow}>
                  <span className={shared.drawerRowLabel}>Người duyệt</span>
                  <span className={shared.drawerRowValue}>{data.approved_by || '—'}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
