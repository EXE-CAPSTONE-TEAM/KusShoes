import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCw } from 'lucide-react';
import { AdminApiError, adminBilling, adminDashboard } from '../../../api/adminClient';
import type { AdminInvoice } from '../../../types/admin';
import { InvoiceDetailDrawer } from '../Billing/InvoiceDetailDrawer';
import shared from '../admin-shared.module.css';
import styles from '../Analytics/MetricDetailModal.module.css';

interface RevenueThisMonthModalProps {
  /** Figure shown on the dashboard card; null while it is still loading. */
  total: number | null;
  onClose: () => void;
}

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;

const formatDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

const METHOD_LABEL: Record<string, string> = { payos: 'PayOS', momo: 'MoMo', manual: 'Thủ công' };

// Servers without the dedicated endpoint: page through the regular invoice list (newest first)
// and keep the invoices paid in the current UTC month — the same bucket the revenue figures use.
async function loadPaidThisMonthFromInvoiceList(): Promise<AdminInvoice[]> {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  // An invoice can be paid shortly after it was created, so keep paging a little past the month start.
  const stopBefore = monthStart - 3 * 24 * 60 * 60 * 1000;
  const paid: AdminInvoice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await adminBilling.invoices({ status: 'paid', limit: 100, cursor });
    for (const invoice of result.items) {
      if (invoice.paid_at && new Date(invoice.paid_at).getTime() >= monthStart) paid.push(invoice);
    }
    const oldest = result.items[result.items.length - 1];
    if (!result.next_cursor || !oldest || new Date(oldest.created_at).getTime() < stopBefore) break;
    cursor = result.next_cursor;
  }
  return paid.sort((a, b) => new Date(b.paid_at ?? 0).getTime() - new Date(a.paid_at ?? 0).getTime());
}

async function loadPaidThisMonth(): Promise<AdminInvoice[]> {
  try {
    return await adminDashboard.revenueThisMonth();
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 404 || err.status === 405)) {
      return loadPaidThisMonthFromInvoiceList();
    }
    throw err;
  }
}

export const RevenueThisMonthModal: React.FC<RevenueThisMonthModalProps> = ({ total: cardTotal, onClose }) => {
  const [invoices, setInvoices] = useState<AdminInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminInvoice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setInvoices(null);
    setError(null);
    loadPaidThisMonth()
      .then((rows) => active && setInvoices(rows))
      .catch((err) => active && setError(err?.message || 'Không thể tải danh sách giao dịch.'));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selected]);

  const total = useMemo(() => (invoices ?? []).reduce((sum, inv) => sum + inv.amount_vnd, 0), [invoices]);
  const monthLabel = new Date().toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });

  // Level 2: the invoice detail replaces the list; closing it returns to the list.
  if (selected) {
    return <InvoiceDetailDrawer invoice={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleArea}>
              <div className={styles.badgeRow}>
                <span className={styles.categoryBadge}>Doanh thu &amp; Dòng tiền</span>
              </div>
              <h3 className={styles.title}>Doanh thu tháng này ({monthLabel})</h3>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng cửa sổ">
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.valueBanner}>
            <span className={styles.valueBannerLabel}>Giá trị ghi nhận hiện thời</span>
            <span className={styles.valueBannerNumber}>
              {formatVnd(cardTotal ?? total)}
            </span>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>Công thức tính toán (Formula)</h4>
            <div className={styles.formulaBox}>
              Doanh thu tháng này = SUM(số tiền thực trả) của các hóa đơn có trạng thái &quot;paid&quot; và
              thời điểm thanh toán nằm trong tháng dương lịch hiện tại
            </div>
            <div className={styles.variableList}>
              <div className={styles.variableItem}>
                <span className={styles.variableSymbol}>Số tiền thực trả:</span>
                <span className={styles.variableDesc}>
                  Giá niêm yết đã trừ giảm giá (coupon), là số tiền khách đã thanh toán.
                </span>
              </div>
              <div className={styles.variableItem}>
                <span className={styles.variableSymbol}>Hóa đơn hoàn tiền / hủy / chờ:</span>
                <span className={styles.variableDesc}>Không được tính vào doanh thu tháng.</span>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>
              Các giao dịch cấu thành ({invoices ? invoices.length : '…'}) — bấm một dòng để xem chi tiết hóa đơn
            </h4>

            {error && (
              <div className={shared.errorState}>
                <span className={shared.errorMessage}>{error}</span>
                <button className={shared.retryBtn} onClick={() => setReloadKey((k) => k + 1)}>
                  <RotateCw size={14} /> Thử lại
                </button>
              </div>
            )}
            {!error && !invoices && <div className={shared.emptyState}>Đang tải giao dịch...</div>}
            {invoices && invoices.length === 0 && (
              <div className={shared.emptyState}>Chưa có giao dịch nào được thanh toán trong tháng này.</div>
            )}
            {invoices && invoices.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Gói</th>
                      <th>Phương thức</th>
                      <th>Thanh toán lúc</th>
                      <th style={{ textAlign: 'right' }}>Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => setSelected(inv)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(inv)}
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        title="Xem chi tiết hóa đơn"
                      >
                        <td className={styles.cellLabel}>{inv.order_code}</td>
                        <td>{inv.user_email ?? '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {inv.plan_tier} ({inv.billing_cycle === 'yearly' ? 'năm' : 'tháng'})
                        </td>
                        <td>{METHOD_LABEL[inv.payment_method] ?? inv.payment_method}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(inv.paid_at)}</td>
                        <td className={styles.cellValue}>{formatVnd(inv.amount_vnd)}</td>
                      </tr>
                    ))}
                    <tr className={styles.tableRowHighlight}>
                      <td colSpan={5}>Tổng cộng</td>
                      <td className={styles.cellValue}>{formatVnd(total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
