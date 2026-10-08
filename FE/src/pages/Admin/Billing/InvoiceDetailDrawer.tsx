import React, { useEffect, useState } from 'react';
import { X, RotateCw, Download, Printer, Loader2, Maximize2 } from 'lucide-react';
import { adminBilling } from '../../../api/adminClient';
import type { AdminInvoice } from '../../../types/admin';
import shared from '../admin-shared.module.css';
import styles from './InvoiceDetailDrawer.module.css';

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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fullView, setFullView] = useState(false);

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

  const handleDownloadPdf = async () => {
    if (!data) return;
    setDownloadingPdf(true);
    setDownloadError(null);
    try {
      const receipt = await adminBilling.receipt(data.id);
      if (receipt?.download_url) {
        window.open(receipt.download_url, '_blank', 'noopener');
      } else {
        setDownloadError('Không tìm thấy đường dẫn tải biên lai.');
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Không thể tải hóa đơn PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

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

  const receiptPaper = data ? (
    <div className={styles.paperReceipt}>
      <div className={styles.receiptTop}>
        <div className={styles.brandGroup}>
          <img
            src="/KusShoes_Logo_cropped.webp"
            alt="KusShoes"
            className={`${styles.brandLogo} ${styles.logoLight}`}
          />
          <img
            src="/KusShoes_Logo_Dark_Mode_cropped.webp"
            alt="KusShoes"
            className={`${styles.brandLogo} ${styles.logoDark}`}
          />
          <span className={styles.brandSub}>3D SNEAKER LAB &bull; SHOE DESIGN PLATFORM</span>
        </div>
        <div
          className={`${styles.stampBadge} ${
            data.status === 'refunded'
              ? styles.stampRefunded
              : data.status === 'cancelled' || data.status === 'failed'
              ? styles.stampCancelled
              : ''
          }`}
        >
          {data.status === 'paid'
            ? '✔ ĐÃ THANH TOÁN'
            : data.status === 'refunded'
            ? 'ĐÃ HOÀN TIỀN'
            : data.status === 'cancelled'
            ? 'ĐÃ HỦY'
            : 'CHỜ THANH TOÁN'}
        </div>
      </div>

      <div className={styles.receiptTitleSection}>
        <h4 className={styles.receiptTitle}>BIÊN NHẬN THANH TOÁN</h4>
        <div className={styles.receiptNumber}>
          Số chứng từ: {data.receipt_number || `KUS-${data.order_code}`}
        </div>
      </div>

      <div className={styles.receiptInfoGrid}>
        <div className={styles.infoCol}>
          <span className={styles.infoLabel}>Đơn vị cung cấp</span>
          <span className={styles.infoValue}>KusShoes Platform</span>
          <span className={styles.infoLabel} style={{ marginTop: 6 }}>Ngày thanh toán</span>
          <span className={styles.infoValue}>{formatDateTime(data.paid_at || data.created_at)}</span>
        </div>
        <div className={styles.infoCol}>
          <span className={styles.infoLabel}>Khách hàng</span>
          <span className={styles.infoValue}>Tài khoản: {data.user_email || '—'}</span>
          <span className={styles.infoLabel} style={{ marginTop: 6 }}>Mã đơn hàng</span>
          <span className={styles.infoValue}>Đơn #{data.order_code}</span>
        </div>
      </div>

      <table className={styles.receiptTable}>
        <thead>
          <tr>
            <th>Dịch vụ / Gói</th>
            <th style={{ textAlign: 'center' }}>Chu kỳ</th>
            <th style={{ textAlign: 'right' }}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong style={{ textTransform: 'capitalize' }}>Gói {data.plan_tier}</strong>
            </td>
            <td style={{ textAlign: 'center', textTransform: 'capitalize' }}>
              {data.billing_cycle === 'yearly' ? 'Hàng năm' : data.billing_cycle === 'monthly' ? 'Hàng tháng' : data.billing_cycle}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>
              {formatVnd(data.listed_price_vnd)}
            </td>
          </tr>
          {data.discount_vnd > 0 && (
            <tr>
              <td colSpan={2} style={{ color: 'var(--color-success, #10b981)' }}>
                Chiết khấu {data.coupon_code ? `(Coupon: ${data.coupon_code})` : ''}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--color-success, #10b981)', fontWeight: 600 }}>
                -{formatVnd(data.discount_vnd)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className={styles.receiptTotals}>
        <div className={styles.totalRow}>
          <span>Giá niêm yết:</span>
          <span>{formatVnd(data.listed_price_vnd)}</span>
        </div>
        {data.discount_vnd > 0 && (
          <div className={styles.totalRow}>
            <span>Giảm trừ:</span>
            <span>-{formatVnd(data.discount_vnd)}</span>
          </div>
        )}
        <div className={styles.totalRowGrand}>
          <span>TỔNG TIỀN THỰC TRẢ:</span>
          <span>{formatVnd(data.amount_vnd)}</span>
        </div>
        <div className={styles.vatNotice}>
          {data.vat?.enabled
            ? `Trong đó VAT (${data.vat.rate_percent}%): ${formatVnd(data.vat.vat_vnd)}`
            : 'Không áp dụng thuế GTGT'}
        </div>
      </div>

      <div className={styles.receiptFooter}>
        Đây là chứng từ biên nhận thanh toán điện tử nội bộ được phát hành tự động bởi KusShoes.
        <br />
        Chứng nhận giao dịch hợp lệ giữa khách hàng và KusShoes 3D Sneaker Lab.
      </div>
    </div>
  ) : null;

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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 id="invoice-drawer-title" className={shared.drawerTitle}>
              {data ? `Hóa đơn #${data.order_code}` : 'Chi tiết hóa đơn'}
            </h3>
            {data?.receipt_number && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)' }}>
                Biên lai: {data.receipt_number}
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            {data && data.status === 'paid' && (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                title="Tải hoặc xem file PDF biên lai thanh toán chính thức"
              >
                {downloadingPdf ? <Loader2 size={14} className={styles.spin} /> : <Download size={14} />}
                <span>{downloadingPdf ? 'Đang tạo PDF...' : 'Tải file PDF'}</span>
              </button>
            )}
            {data && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handlePrint}
                title="In biên lai này"
              >
                <Printer size={14} />
                <span>In</span>
              </button>
            )}
            <button
              className={shared.drawerCloseBtn}
              onClick={onClose}
              aria-label="Đóng chi tiết"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className={shared.errorState} style={{ margin: '8px 0' }}>
            <span className={shared.errorMessage}>{downloadError}</span>
          </div>
        )}

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
            <div className={styles.receiptWrap}>
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setFullView(true)}
                title="Xem toàn bộ biên lai"
                aria-label="Xem toàn bộ biên lai"
              >
                <Maximize2 size={14} />
              </button>
              {receiptPaper}
            </div>

            <div style={{ marginTop: 24, marginBottom: 8, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Chi tiết đối soát &amp; kỹ thuật
            </div>
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

      {fullView && receiptPaper && (
        <div
          className={styles.fullOverlay}
          onClick={(e) => {
            e.stopPropagation();
            setFullView(false);
          }}
          data-testid="invoice-receipt-fullview"
        >
          <div
            className={styles.fullDialog}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Biên lai toàn bộ"
          >
            <button
              type="button"
              className={styles.fullCloseBtn}
              onClick={() => setFullView(false)}
              aria-label="Đóng xem toàn bộ"
            >
              <X size={18} />
            </button>
            {receiptPaper}
          </div>
        </div>
      )}
    </div>
  );
};
