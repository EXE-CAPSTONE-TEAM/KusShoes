import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCw } from 'lucide-react';
import { adminDashboard } from '../../../api/adminClient';
import type { AdminInvoice, DashboardStats } from '../../../types/admin';
import { InvoiceDetailDrawer } from '../Billing/InvoiceDetailDrawer';
import shared from '../admin-shared.module.css';
import styles from '../Analytics/MetricDetailModal.module.css';

interface RevenueThisMonthModalProps {
  stats: DashboardStats | null;
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
      })
    : '—';

const METHOD_LABEL: Record<string, string> = { payos: 'PayOS', momo: 'MoMo', manual: 'Thủ công' };

export const RevenueThisMonthModal: React.FC<RevenueThisMonthModalProps> = ({ stats, onClose }) => {
  const [invoices, setInvoices] = useState<AdminInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminInvoice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setInvoices(null);
    setError(null);
    adminDashboard
      .revenueThisMonth()
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
              {formatVnd(stats?.revenue_this_month_vnd ?? 0)}
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
                        <td>{formatDateTime(inv.paid_at)}</td>
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
