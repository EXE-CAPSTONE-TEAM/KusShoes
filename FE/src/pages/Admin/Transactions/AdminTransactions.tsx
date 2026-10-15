import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { InvoiceDetailDrawer } from '../Billing/InvoiceDetailDrawer';
import { adminBilling, type InvoiceListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import type { AdminInvoice } from '../../../types/admin';
import shared from '../admin-shared.module.css';
import styles from './AdminTransactions.module.css';
import {
  DEFAULT_FILTERS,
  buildInvoiceQuery,
  countActiveFilters,
  validateFilters,
  type TransactionFilters,
} from './transactionFilters';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Đang chờ thanh toán' },
  { value: 'awaiting_approval', label: 'Chờ duyệt (thủ công)' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label]),
);

const METHOD_OPTIONS = [
  { value: 'all', label: 'Mọi phương thức' },
  { value: 'payos', label: 'PayOS (VietQR / Thẻ)' },
  { value: 'momo', label: 'Ví MoMo' },
  { value: 'manual', label: 'Chuyển khoản thủ công' },
];

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label]),
);

const TIER_OPTIONS = [
  { value: 'all', label: 'Mọi gói' },
  { value: 'free', label: 'Free' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
];

const CYCLE_OPTIONS = [
  { value: 'all', label: 'Mọi chu kỳ' },
  { value: 'monthly', label: 'Theo tháng' },
  { value: 'yearly', label: 'Theo năm' },
];

const CYCLE_LABEL: Record<string, string> = { monthly: 'Tháng', yearly: 'Năm' };

const COUPON_OPTIONS = [
  { value: 'all', label: 'Có / không mã giảm giá' },
  { value: 'yes', label: 'Có dùng mã giảm giá' },
  { value: 'no', label: 'Không dùng mã giảm giá' },
];

const TX_TYPE_OPTIONS = [
  { value: 'all', label: 'Tự động và thủ công' },
  { value: 'auto', label: 'Qua cổng thanh toán' },
  { value: 'manual', label: 'Ghi nhận thủ công' },
];

const UPGRADE_OPTIONS = [
  { value: 'all', label: 'Mua mới và nâng cấp' },
  { value: 'new', label: 'Mua mới / gia hạn' },
  { value: 'upgrade', label: 'Nâng cấp giữa kỳ' },
];

const DAY_MS = 86_400_000;
// Độ trễ chờ người dùng gõ xong trước khi gọi API (ô văn bản / số).
const SEARCH_DEBOUNCE_MS = 400;

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const toLocalIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type PresetId = 'today' | '7d' | '30d' | 'month';

const PRESETS: { id: PresetId; label: string; range: (today: Date) => [string, string] }[] = [
  { id: 'today', label: 'Hôm nay', range: (t) => [toLocalIso(t), toLocalIso(t)] },
  { id: '7d', label: '7 ngày', range: (t) => [toLocalIso(new Date(t.getTime() - 6 * DAY_MS)), toLocalIso(t)] },
  { id: '30d', label: '30 ngày', range: (t) => [toLocalIso(new Date(t.getTime() - 29 * DAY_MS)), toLocalIso(t)] },
  { id: 'month', label: 'Tháng này', range: (t) => [toLocalIso(new Date(t.getFullYear(), t.getMonth(), 1)), toLocalIso(t)] },
];

export const AdminTransactions: React.FC = () => {
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<AdminInvoice | null>(null);

  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  // Debounce: chỉ áp dụng bộ lọc sau khi người dùng ngừng gõ.
  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(filters), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const errors = useMemo(() => validateFilters(filters), [filters]);
  const activeCount = countActiveFilters(filters);
  const query = useMemo(() => buildInvoiceQuery(applied), [applied]);

  const fetcher = useCallback(
    (q: InvoiceListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminBilling.invoices(q, signal),
    [],
  );
  const { items, loading, loadingMore, error, hasMore, reload, loadMore } = useCursorList<AdminInvoice, InvoiceListQuery>({
    fetcher,
    query,
    getId: (i) => i.id,
  });

  const activePreset = useMemo(() => {
    const today = new Date();
    return PRESETS.find((p) => {
      const [from, to] = p.range(today);
      return filters.dateFrom === from && filters.dateTo === to;
    })?.id;
  }, [filters.dateFrom, filters.dateTo]);

  const applyPreset = (id: PresetId) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const [from, to] = preset.range(new Date());
    setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  // Tổng hợp trên các giao dịch đã tải (không phải toàn bộ kết quả khi còn "Tải thêm").
  const summary = useMemo(() => {
    const paid = items.filter((i) => i.status === 'paid');
    return {
      paidCount: paid.length,
      paidTotal: paid.reduce((sum, i) => sum + i.amount_vnd, 0),
      discountTotal: items.reduce((sum, i) => sum + i.discount_vnd, 0),
      waiting: items.filter((i) => i.status === 'pending' || i.status === 'awaiting_approval').length,
    };
  }, [items]);

  const text = (key: 'q' | 'couponCode' | 'userId', label: string, placeholder: string, wide = false) => (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.fieldLabel} htmlFor={`tx-${key}`}>{label}</label>
      <input
        id={`tx-${key}`}
        className={`${styles.fieldInput} ${key === 'userId' && errors.userId ? styles.fieldInputError : ''}`}
        value={filters[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
      {key === 'userId' && errors.userId && <span className={styles.fieldError}>{errors.userId}</span>}
    </div>
  );

  const dropdown = (label: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void) => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <Select value={value} onValueChange={onChange} options={options} ariaLabel={label} />
    </div>
  );

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Giao dịch</h1>
          <p className={shared.pageSubtitle}>
            Toàn bộ giao dịch thanh toán của hệ thống, kèm bộ lọc theo trạng thái, thời gian, số tiền, gói và mã giảm giá.
          </p>
        </div>
      </div>

      <div className={shared.statsGrid}>
        <div className={shared.statCard}>
          <span className={shared.statLabel}>Giao dịch đã tải</span>
          <span className={shared.statValue}>{items.length.toLocaleString('vi-VN')}</span>
        </div>
        <div className={shared.statCard}>
          <span className={shared.statLabel}>Thu thành công</span>
          <span className={shared.statValue}>{formatVnd(summary.paidTotal)}</span>
        </div>
        <div className={shared.statCard}>
          <span className={shared.statLabel}>Giao dịch đã thanh toán</span>
          <span className={shared.statValue}>{summary.paidCount.toLocaleString('vi-VN')}</span>
        </div>
        <div className={shared.statCard}>
          <span className={shared.statLabel}>Đang chờ xử lý</span>
          <span className={shared.statValue}>{summary.waiting.toLocaleString('vi-VN')}</span>
        </div>
        <div className={shared.statCard}>
          <span className={shared.statLabel}>Tổng giảm giá</span>
          <span className={shared.statValue}>{formatVnd(summary.discountTotal)}</span>
        </div>
      </div>

      <section className={styles.filterPanel} aria-label="Bộ lọc giao dịch">
        <div className={styles.filterHeader}>
          <h2 className={styles.filterTitle}>
            Bộ lọc
            {activeCount > 0 && <span className={styles.activeCount}>{activeCount} đang áp dụng</span>}
          </h2>
          <div className={styles.presetGroup} role="group" aria-label="Khoảng thời gian nhanh">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.presetBtn} ${activePreset === p.id ? styles.presetBtnActive : ''}`}
                aria-pressed={activePreset === p.id}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGrid}>
          {text('q', '1. Từ khóa', 'Mã đơn, mã tham chiếu, biên lai, email, người chuyển...', true)}
          {dropdown('2. Trạng thái', filters.status, STATUS_OPTIONS, (v) => set('status', v))}
          {dropdown('3. Phương thức', filters.paymentMethod, METHOD_OPTIONS, (v) => set('paymentMethod', v))}
          {dropdown('4. Gói cước', filters.planTier, TIER_OPTIONS, (v) => set('planTier', v))}
          {dropdown('5. Chu kỳ', filters.billingCycle, CYCLE_OPTIONS, (v) => set('billingCycle', v))}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tx-date-from">6. Từ ngày</label>
            <input
              id="tx-date-from"
              type="date"
              className={`${styles.fieldInput} ${errors.date ? styles.fieldInputError : ''}`}
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => set('dateFrom', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tx-date-to">7. Đến ngày</label>
            <input
              id="tx-date-to"
              type="date"
              className={`${styles.fieldInput} ${errors.date ? styles.fieldInputError : ''}`}
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => set('dateTo', e.target.value)}
            />
            {errors.date && <span className={styles.fieldError}>{errors.date}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tx-min">8. Số tiền từ (VNĐ)</label>
            <input
              id="tx-min"
              inputMode="numeric"
              className={`${styles.fieldInput} ${errors.amount ? styles.fieldInputError : ''}`}
              value={filters.minAmount}
              placeholder="0"
              onChange={(e) => set('minAmount', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tx-max">9. Số tiền đến (VNĐ)</label>
            <input
              id="tx-max"
              inputMode="numeric"
              className={`${styles.fieldInput} ${errors.amount ? styles.fieldInputError : ''}`}
              value={filters.maxAmount}
              placeholder="Không giới hạn"
              onChange={(e) => set('maxAmount', e.target.value)}
            />
            {errors.amount && <span className={styles.fieldError}>{errors.amount}</span>}
          </div>

          {dropdown('10. Mã giảm giá', filters.couponPresence, COUPON_OPTIONS, (v) => set('couponPresence', v as TransactionFilters['couponPresence']))}
          {text('couponCode', '11. Mã giảm giá cụ thể', 'VD: KUS10')}
          {dropdown('12. Loại giao dịch', filters.txType, TX_TYPE_OPTIONS, (v) => set('txType', v as TransactionFilters['txType']))}
          {dropdown('13. Hình thức mua', filters.upgrade, UPGRADE_OPTIONS, (v) => set('upgrade', v as TransactionFilters['upgrade']))}
          {text('userId', '14. User ID', 'UUID người dùng')}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>15. Phạm vi</span>
            <label className={styles.checkField}>
              <input
                type="checkbox"
                checked={filters.excludeInternal}
                onChange={(e) => set('excludeInternal', e.target.checked)}
              />
              Loại tài khoản nội bộ
            </label>
          </div>
        </div>

        {activeCount > 0 && (
          <div>
            <button type="button" className={shared.clearFiltersBtn} onClick={() => setFilters(DEFAULT_FILTERS)}>
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </section>

      {error ? (
        <div className={shared.errorState}>
          <span className={shared.errorMessage}>{error}</span>
          <button className={shared.retryBtn} onClick={reload}><RotateCw size={14} /> Thử lại</button>
        </div>
      ) : (
        <div className={`${shared.tableWrap} glass-panel`}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Thời điểm tạo</th>
                <th>Người dùng</th>
                <th>Gói</th>
                <th>Số tiền</th>
                <th>Mã giảm giá</th>
                <th>Phương thức</th>
                <th>Trạng thái</th>
                <th>Thanh toán lúc</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(inv)}>
                  <td className={styles.numStrong}>{inv.order_code}</td>
                  <td className={`${shared.mutedCell} ${styles.num}`}>{formatDateTime(inv.created_at)}</td>
                  <td className={shared.mutedCell} title={inv.user_id}>{inv.user_email ?? inv.user_id}</td>
                  <td className={shared.mutedCell} style={{ textTransform: 'capitalize' }}>
                    {inv.plan_tier} · {CYCLE_LABEL[inv.billing_cycle] ?? inv.billing_cycle}
                  </td>
                  <td className={styles.numStrong}>
                    {formatVnd(inv.amount_vnd)}
                    {inv.discount_vnd > 0 && (
                      <span className={styles.discountNote}>Giảm {formatVnd(inv.discount_vnd)}</span>
                    )}
                  </td>
                  <td className={shared.mutedCell}>{inv.coupon_code ?? '—'}</td>
                  <td className={shared.mutedCell}>{METHOD_LABEL[inv.payment_method] ?? inv.payment_method}</td>
                  <td><StatusBadge status={inv.status} label={STATUS_LABEL[inv.status]} /></td>
                  <td className={`${shared.mutedCell} ${styles.num}`}>{formatDateTime(inv.paid_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.detailBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(inv);
                      }}
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={10}><div className={shared.emptyState}>Không có giao dịch phù hợp với bộ lọc.</div></td></tr>
              )}
              {loading && items.length === 0 && (
                <tr><td colSpan={10}><div className={shared.emptyState}>Đang tải...</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && !error && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải...' : 'Tải thêm'}
          </button>
        </div>
      )}

      <InvoiceDetailDrawer invoice={selected} onClose={() => setSelected(null)} />
    </div>
  );
};
