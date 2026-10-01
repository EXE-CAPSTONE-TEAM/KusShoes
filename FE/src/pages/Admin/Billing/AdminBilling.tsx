import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, Download, Eye, RotateCcw, ShieldAlert, RotateCw } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { ApiCostPanel, CouponsPanel, ManualTransactionsPanel, PeriodsPanel, TaxConfigPanel } from './FinancePanels';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminBilling, AdminApiError, type SubscriptionListQuery, type InvoiceListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { isValidUuid } from '../../../utils/validators';
import type { AdminSubscription, AdminInvoice, InvoiceSummary } from '../../../types/admin';
import { InvoiceDetailDialog, InvoiceSummaryPanel } from './InvoiceInsights';
import { CYCLE_LABEL, formatDateTime, METHOD_LABEL, tierLabel } from './invoiceFormat';
import shared from '../admin-shared.module.css';

const TIER_OPTIONS = [
  { value: 'all', label: 'Tất cả gói' },
  { value: 'free', label: 'Free' },
  { value: 'basic_monthly', label: 'Basic (Tháng)' },
  { value: 'basic_yearly', label: 'Basic (Năm)' },
  { value: 'pro_monthly', label: 'Pro (Tháng)' },
  { value: 'pro_yearly', label: 'Pro (Năm)' },
];

const SUB_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Active' },
  { value: 'grace', label: 'Grace' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const INVOICE_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_approval', label: 'Chờ duyệt (thủ công)' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const METHOD_OPTIONS = [
  { value: 'all', label: 'Tất cả phương thức' },
  { value: 'payos', label: 'PayOS' },
  { value: 'momo', label: 'MoMo' },
  { value: 'manual', label: 'Thủ công' },
];

// date inputs give YYYY-MM-DD; the API treats date_to as exclusive, so send the next midnight.
const startOfDayIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endOfDayIso = (day: string) => {
  const next = new Date(`${day}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
};

const csvCell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

export const AdminBilling: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [tab, setTab] = useState<'subscriptions' | 'invoices' | 'manual' | 'periods' | 'coupons' | 'tax' | 'api-cost'>('subscriptions');
  const [mutating, setMutating] = useState(false);

  // Subscriptions
  const [subTier, setSubTier] = useState('all');
  const [subStatus, setSubStatus] = useState('all');
  const [downgradeTarget, setDowngradeTarget] = useState<AdminSubscription | null>(null);

  const subQuery: SubscriptionListQuery = {
    tier: subTier === 'all' ? undefined : subTier,
    status: subStatus === 'all' ? undefined : subStatus,
  };
  const subFetcher = useCallback(
    (q: SubscriptionListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) =>
      adminBilling.subscriptions(q, signal),
    [],
  );
  const {
    items: subs, loading: subLoading, loadingMore: subLoadingMore, error: subError,
    hasMore: subHasMore, reload: reloadSubs, loadMore: loadMoreSubs,
  } = useCursorList<AdminSubscription, SubscriptionListQuery>({ fetcher: subFetcher, query: subQuery, getId: (s) => s.id });

  // Invoices
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [invoiceUserIdInput, setInvoiceUserIdInput] = useState('');
  const [invoiceUserId, setInvoiceUserId] = useState<string | undefined>(undefined);
  const [invoiceUserIdError, setInvoiceUserIdError] = useState<string | null>(null);
  const [invoiceMethod, setInvoiceMethod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailTarget, setDetailTarget] = useState<AdminInvoice | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminInvoice | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundOverride, setRefundOverride] = useState(false);

  const invoiceQuery: InvoiceListQuery = {
    status: invoiceStatus === 'all' ? undefined : invoiceStatus,
    user_id: invoiceUserId,
    payment_method: invoiceMethod === 'all' ? undefined : (invoiceMethod as InvoiceListQuery['payment_method']),
    date_from: dateFrom ? startOfDayIso(dateFrom) : undefined,
    date_to: dateTo ? endOfDayIso(dateTo) : undefined,
  };

  // Revenue overview for the same window/method (status and user filters only narrow the table).
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const loadSummary = useCallback(
    (signal?: AbortSignal) => {
      setSummaryLoading(true);
      setSummaryError(null);
      return adminBilling
        .invoiceSummary(
          {
            payment_method: invoiceMethod === 'all' ? undefined : (invoiceMethod as InvoiceListQuery['payment_method']),
            date_from: dateFrom ? startOfDayIso(dateFrom) : undefined,
            date_to: dateTo ? endOfDayIso(dateTo) : undefined,
          },
          signal,
        )
        .then(setSummary)
        .catch((err) => {
          if (signal?.aborted) return;
          setSummaryError(err instanceof AdminApiError ? err.message : 'Không tải được tổng quan doanh thu.');
        })
        .finally(() => {
          if (!signal?.aborted) setSummaryLoading(false);
        });
    },
    [invoiceMethod, dateFrom, dateTo],
  );
  useEffect(() => {
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const exportInvoicesCsv = () => {
    const header = ['Mã giao dịch', 'Mã đơn', 'Khách hàng', 'Gói', 'Chu kỳ', 'Giá niêm yết', 'Giảm giá', 'Số tiền', 'Phương thức', 'Trạng thái', 'Số biên nhận', 'Ngày tạo', 'Ngày thanh toán'];
    const lines = invoices.map((inv) => [
      inv.id, inv.order_code, inv.user_email ?? inv.user_id, tierLabel(inv.plan_tier),
      CYCLE_LABEL[inv.billing_cycle] ?? inv.billing_cycle, inv.listed_price_vnd, inv.discount_vnd, inv.amount_vnd,
      METHOD_LABEL[inv.payment_method] ?? inv.payment_method, inv.status, inv.receipt_number, inv.created_at, inv.paid_at,
    ]);
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `giao-dich-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const invoiceFetcher = useCallback(
    (q: InvoiceListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) =>
      adminBilling.invoices(q, signal),
    [],
  );
  const {
    items: invoices, loading: invoiceLoading, loadingMore: invoiceLoadingMore, error: invoiceError,
    hasMore: invoiceHasMore, reload: reloadInvoices, loadMore: loadMoreInvoices,
  } = useCursorList<AdminInvoice, InvoiceListQuery>({ fetcher: invoiceFetcher, query: invoiceQuery, getId: (i) => i.id });

  const submitInvoiceUserId = () => {
    const trimmed = invoiceUserIdInput.trim();
    if (!trimmed) {
      setInvoiceUserIdError(null);
      setInvoiceUserId(undefined);
      return;
    }
    if (!isValidUuid(trimmed)) {
      setInvoiceUserIdError('User ID phải là UUID hợp lệ.');
      return;
    }
    setInvoiceUserIdError(null);
    setInvoiceUserId(trimmed);
  };

  const handleForceDowngrade = async () => {
    if (!downgradeTarget || mutating) return;
    setMutating(true);
    try {
      await adminBilling.forceDowngrade(downgradeTarget.user_id);
      toast(`Đã hạ subscription của user ${downgradeTarget.user_email ?? downgradeTarget.user_id} xuống Free`);
      setDowngradeTarget(null);
      reloadSubs();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleRefund = async () => {
    if (!refundTarget || mutating) return;
    setMutating(true);
    try {
      await adminBilling.refund(refundTarget.id, {
        amount_vnd: refundTarget.amount_vnd,
        reason: refundReason.trim() || 'Admin-initiated refund',
        override: refundOverride || undefined,
      });
      toast('Đã tạo bút toán hoàn tiền');
      setRefundTarget(null);
      setRefundReason('');
      setRefundOverride(false);
      reloadInvoices();
      void loadSummary();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Billing</h1>
          <p className={shared.pageSubtitle}>Quản lý subscription và hóa đơn của toàn hệ thống.</p>
        </div>
        {!isAdmin && (
          <span className={shared.forbiddenNote}><ShieldAlert size={14} /> Staff chỉ có quyền xem</span>
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <Tabs.List style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Tabs.Trigger value="subscriptions" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Subscriptions
          </Tabs.Trigger>
          <Tabs.Trigger value="invoices" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Invoices
          </Tabs.Trigger>
          <Tabs.Trigger value="manual" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Giao dịch thủ công
          </Tabs.Trigger>
          <Tabs.Trigger value="periods" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Khóa sổ
          </Tabs.Trigger>
          <Tabs.Trigger value="coupons" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Mã giảm giá
          </Tabs.Trigger>
          <Tabs.Trigger value="tax" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            VAT
          </Tabs.Trigger>
          <Tabs.Trigger value="api-cost" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Chi phí API
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="subscriptions">
          <div className={shared.toolbar} style={{ marginBottom: 16 }}>
            <Select value={subTier} onValueChange={setSubTier} options={TIER_OPTIONS} ariaLabel="Lọc theo gói" />
            <Select value={subStatus} onValueChange={setSubStatus} options={SUB_STATUS_OPTIONS} ariaLabel="Lọc trạng thái" />
          </div>
          {subError ? (
            <div className={shared.errorState}>
              <span className={shared.errorMessage}>{subError}</span>
              <button className={shared.retryBtn} onClick={reloadSubs}><RotateCw size={14} /> Thử lại</button>
            </div>
          ) : (
            <div className={`${shared.tableWrap} glass-panel`}>
              <table className={shared.table}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Gói</th>
                    <th>Trạng thái</th>
                    <th>Bắt đầu</th>
                    <th>Hết hạn</th>
                    <th>Hủy cuối chu kỳ</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id}>
                      <td className={shared.mutedCell} title={s.user_id}>{s.user_email ?? s.user_id}</td>
                      <td className={shared.mutedCell}>{s.tier}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className={shared.mutedCell}>{formatDate(s.started_at)}</td>
                      <td className={shared.mutedCell}>{formatDate(s.expires_at)}</td>
                      <td className={shared.mutedCell}>{s.cancel_at_period_end ? 'Có' : 'Không'}</td>
                      <td>
                        <button
                          className={shared.iconBtn}
                          title={isAdmin ? 'Buộc hạ xuống Free' : 'Chỉ Admin mới được thực hiện'}
                          disabled={!isAdmin || s.tier === 'free' || mutating}
                          onClick={() => setDowngradeTarget(s)}
                        >
                          <ArrowDownCircle size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!subLoading && subs.length === 0 && (
                    <tr><td colSpan={7}><div className={shared.emptyState}>Không có subscription phù hợp.</div></td></tr>
                  )}
                  {subLoading && subs.length === 0 && (
                    <tr><td colSpan={7}><div className={shared.emptyState}>Đang tải...</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {subHasMore && !subError && (
            <div className={shared.loadMoreRow}>
              <button className={shared.textBtn} onClick={loadMoreSubs} disabled={subLoadingMore}>
                {subLoadingMore ? 'Đang tải...' : 'Tải thêm'}
              </button>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="invoices">
          <div className={shared.toolbar} style={{ marginBottom: 16 }}>
            <Select value={invoiceStatus} onValueChange={setInvoiceStatus} options={INVOICE_STATUS_OPTIONS} ariaLabel="Lọc trạng thái hóa đơn" />
            <input
              className={`${shared.filterInput} ${invoiceUserIdError ? shared.filterInputError : ''}`}
              placeholder="User ID (UUID)..."
              value={invoiceUserIdInput}
              onChange={(e) => setInvoiceUserIdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitInvoiceUserId(); }}
              onBlur={submitInvoiceUserId}
            />
            <Select value={invoiceMethod} onValueChange={setInvoiceMethod} options={METHOD_OPTIONS} ariaLabel="Lọc phương thức thanh toán" />
            <input type="date" className={shared.filterInput} aria-label="Từ ngày" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className={shared.filterInput} aria-label="Đến ngày" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
            {(invoiceStatus !== 'all' || invoiceUserId || invoiceMethod !== 'all' || dateFrom || dateTo) && (
              <button
                className={shared.clearFiltersBtn}
                onClick={() => { setInvoiceStatus('all'); setInvoiceUserIdInput(''); setInvoiceUserId(undefined); setInvoiceUserIdError(null); setInvoiceMethod('all'); setDateFrom(''); setDateTo(''); }}
              >
                Xóa bộ lọc
              </button>
            )}
            <button className="btn-outline" onClick={exportInvoicesCsv} disabled={invoices.length === 0} title="Xuất các giao dịch đang hiển thị">
              <Download size={14} /> Xuất CSV
            </button>
          </div>
          <InvoiceSummaryPanel summary={summary} loading={summaryLoading} error={summaryError} />
          {invoiceUserIdError && <p className={shared.errorMessage} style={{ marginTop: -8, marginBottom: 12 }}>{invoiceUserIdError}</p>}
          {invoiceError ? (
            <div className={shared.errorState}>
              <span className={shared.errorMessage}>{invoiceError}</span>
              <button className={shared.retryBtn} onClick={reloadInvoices}><RotateCw size={14} /> Thử lại</button>
            </div>
          ) : (
            <div className={`${shared.tableWrap} glass-panel`}>
              <table className={shared.table}>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>User</th>
                    <th>Gói</th>
                    <th>Chu kỳ</th>
                    <th>Số tiền</th>
                    <th>Phương thức</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    <th>Ngày thanh toán</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className={shared.mutedCell}>{inv.order_code}</td>
                      <td className={shared.mutedCell} title={inv.user_id}>{inv.user_email ?? inv.user_id}</td>
                      <td className={shared.mutedCell}>{tierLabel(inv.plan_tier)}</td>
                      <td className={shared.mutedCell}>{CYCLE_LABEL[inv.billing_cycle] ?? inv.billing_cycle}</td>
                      <td>{formatVnd(inv.amount_vnd)}</td>
                      <td className={shared.mutedCell}>{METHOD_LABEL[inv.payment_method] ?? inv.payment_method}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td className={shared.mutedCell}>{formatDateTime(inv.created_at)}</td>
                      <td className={shared.mutedCell}>{formatDateTime(inv.paid_at)}</td>
                      <td>
                        <button className={shared.iconBtn} title="Xem chi tiết" onClick={() => setDetailTarget(inv)}>
                          <Eye size={14} />
                        </button>
                        <button
                          className={shared.iconBtn}
                          title={isAdmin ? 'Hoàn tiền' : 'Chỉ Admin mới được thực hiện'}
                          disabled={!isAdmin || inv.status !== 'paid' || mutating}
                          onClick={() => setRefundTarget(inv)}
                        >
                          <RotateCcw size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!invoiceLoading && invoices.length === 0 && (
                    <tr><td colSpan={10}><div className={shared.emptyState}>Không có hóa đơn phù hợp.</div></td></tr>
                  )}
                  {invoiceLoading && invoices.length === 0 && (
                    <tr><td colSpan={10}><div className={shared.emptyState}>Đang tải...</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {invoiceHasMore && !invoiceError && (
            <div className={shared.loadMoreRow}>
              <button className={shared.textBtn} onClick={loadMoreInvoices} disabled={invoiceLoadingMore}>
                {invoiceLoadingMore ? 'Đang tải...' : 'Tải thêm'}
              </button>
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="manual"><ManualTransactionsPanel /></Tabs.Content>
        <Tabs.Content value="periods"><PeriodsPanel /></Tabs.Content>
        <Tabs.Content value="coupons"><CouponsPanel /></Tabs.Content>
        <Tabs.Content value="tax"><TaxConfigPanel /></Tabs.Content>
        <Tabs.Content value="api-cost"><ApiCostPanel /></Tabs.Content>
      </Tabs.Root>

      <ConfirmDialog
        open={downgradeTarget !== null}
        onOpenChange={(open) => !open && setDowngradeTarget(null)}
        title={`Buộc hạ gói của user ${downgradeTarget?.user_email ?? downgradeTarget?.user_id ?? ''}?`}
        description="Tài khoản sẽ ngay lập tức chuyển về gói Free và mất quyền truy cập các tính năng trả phí."
        confirmLabel="Hạ xuống Free"
        onConfirm={handleForceDowngrade}
      />

      <InvoiceDetailDialog invoice={detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)} />

      <AdminDialog
        open={refundTarget !== null}
        onOpenChange={(open) => { if (!open) { setRefundTarget(null); setRefundReason(''); setRefundOverride(false); } }}
        title={`Hoàn tiền hóa đơn ${refundTarget?.id.slice(0, 8) ?? ''}?`}
        description="Tạo bút toán hoàn toàn bộ số tiền; hóa đơn gốc không đổi. Hoàn toàn bộ gói hiện tại sẽ hạ tài khoản về Free. Chỉ tự động trong 7 ngày và khi chưa xuất file."
        submitLabel="Yêu cầu hoàn tiền"
        busy={mutating}
        onSubmit={() => void handleRefund()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Lý do</label>
          <input className={shared.input} value={refundReason} maxLength={500} placeholder="Khách yêu cầu trong 7 ngày" onChange={(event) => setRefundReason(event.target.value)} />
        </div>
        <label className={`${shared.checkRow} ${shared.formGridFull}`}>
          <input type="checkbox" checked={refundOverride} onChange={(event) => setRefundOverride(event.target.checked)} />
          Duyệt ngoại lệ (ngoài chính sách 7 ngày / đã xuất file)
        </label>
      </AdminDialog>
    </div>
  );
};
