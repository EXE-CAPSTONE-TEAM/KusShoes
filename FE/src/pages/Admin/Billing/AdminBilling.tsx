import React, { useCallback, useState } from 'react';
import { ArrowDownCircle, RotateCcw, ShieldAlert, RotateCw } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminBilling, AdminApiError, type SubscriptionListQuery, type InvoiceListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { isValidUuid } from '../../../utils/validators';
import type { AdminSubscription, AdminInvoice } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const TIER_OPTIONS = [
  { value: 'all', label: 'Tất cả gói' },
  { value: 'free', label: 'Free' },
  { value: 'creator_monthly', label: 'Creator (Tháng)' },
  { value: 'creator_yearly', label: 'Creator (Năm)' },
  { value: 'pro_monthly', label: 'Pro (Tháng)' },
  { value: 'pro_yearly', label: 'Pro (Năm)' },
];

const SUB_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const INVOICE_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

export const AdminBilling: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [tab, setTab] = useState<'subscriptions' | 'invoices'>('subscriptions');
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
  const [refundTarget, setRefundTarget] = useState<AdminInvoice | null>(null);

  const invoiceQuery: InvoiceListQuery = {
    status: invoiceStatus === 'all' ? undefined : invoiceStatus,
    user_id: invoiceUserId,
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
      const res = await adminBilling.refund(refundTarget.id);
      toast(`Yêu cầu hoàn tiền đã gửi (Polar refund: ${res.polar_refund_id})`);
      setRefundTarget(null);
      reloadInvoices();
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

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as 'subscriptions' | 'invoices')}>
        <Tabs.List style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Tabs.Trigger value="subscriptions" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Subscriptions
          </Tabs.Trigger>
          <Tabs.Trigger value="invoices" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>
            Invoices
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
            {(invoiceStatus !== 'all' || invoiceUserId) && (
              <button
                className={shared.clearFiltersBtn}
                onClick={() => { setInvoiceStatus('all'); setInvoiceUserIdInput(''); setInvoiceUserId(undefined); setInvoiceUserIdError(null); }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
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
                    <th>User</th>
                    <th>Gói</th>
                    <th>Chu kỳ</th>
                    <th>Số tiền</th>
                    <th>Phương thức</th>
                    <th>Trạng thái</th>
                    <th>Ngày thanh toán</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className={shared.mutedCell} title={inv.user_id}>{inv.user_email ?? inv.user_id}</td>
                      <td className={shared.mutedCell} style={{ textTransform: 'capitalize' }}>{inv.plan_tier}</td>
                      <td className={shared.mutedCell}>{inv.billing_cycle}</td>
                      <td>{formatVnd(inv.amount_vnd)}</td>
                      <td className={shared.mutedCell}>{inv.payment_method}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td className={shared.mutedCell}>{formatDate(inv.paid_at)}</td>
                      <td>
                        <button
                          className={shared.iconBtn}
                          title={isAdmin ? 'Hoàn tiền' : 'Chỉ Admin mới được thực hiện'}
                          disabled={!isAdmin || inv.status !== 'paid' || inv.payment_method !== 'polar' || !inv.polar_order_id || mutating}
                          onClick={() => setRefundTarget(inv)}
                        >
                          <RotateCcw size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!invoiceLoading && invoices.length === 0 && (
                    <tr><td colSpan={8}><div className={shared.emptyState}>Không có hóa đơn phù hợp.</div></td></tr>
                  )}
                  {invoiceLoading && invoices.length === 0 && (
                    <tr><td colSpan={8}><div className={shared.emptyState}>Đang tải...</div></td></tr>
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
      </Tabs.Root>

      <ConfirmDialog
        open={downgradeTarget !== null}
        onOpenChange={(open) => !open && setDowngradeTarget(null)}
        title={`Buộc hạ gói của user ${downgradeTarget?.user_email ?? downgradeTarget?.user_id ?? ''}?`}
        description="Tài khoản sẽ ngay lập tức chuyển về gói Free và mất quyền truy cập các tính năng trả phí."
        confirmLabel="Hạ xuống Free"
        onConfirm={handleForceDowngrade}
      />

      <ConfirmDialog
        open={refundTarget !== null}
        onOpenChange={(open) => !open && setRefundTarget(null)}
        title={`Hoàn tiền hóa đơn ${refundTarget?.id ?? ''}?`}
        description="Yêu cầu hoàn tiền sẽ được gửi tới Polar. Trạng thái hóa đơn chỉ chuyển thành 'refunded' sau khi nhận webhook xác nhận."
        confirmLabel="Yêu cầu hoàn tiền"
        onConfirm={handleRefund}
      />
    </div>
  );
};
