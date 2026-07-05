import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, RotateCcw, ShieldAlert } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminBilling, AdminApiError } from '../../../api/adminClient';
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
  const { isAdmin, session } = useAdminAuth();
  const [tab, setTab] = useState<'subscriptions' | 'invoices'>('subscriptions');

  // Subscriptions
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [subTier, setSubTier] = useState('all');
  const [subStatus, setSubStatus] = useState('all');
  const [subHasMore, setSubHasMore] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<AdminSubscription | null>(null);

  // Invoices
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [invoiceHasMore, setInvoiceHasMore] = useState(false);
  const [refundTarget, setRefundTarget] = useState<AdminInvoice | null>(null);

  const loadSubs = async (before?: string) => {
    const result = await adminBilling.subscriptions({
      tier: subTier === 'all' ? undefined : subTier,
      status: subStatus === 'all' ? undefined : subStatus,
      limit: 20,
      before,
    });
    setSubs(prev => (before ? [...prev, ...result] : result));
    setSubHasMore(result.length === 20);
  };

  const loadInvoices = async (before?: string) => {
    const result = await adminBilling.invoices({
      status: invoiceStatus === 'all' ? undefined : invoiceStatus,
      limit: 20,
      before,
    });
    setInvoices(prev => (before ? [...prev, ...result] : result));
    setInvoiceHasMore(result.length === 20);
  };

  useEffect(() => { loadSubs(); }, [subTier, subStatus]);
  useEffect(() => { loadInvoices(); }, [invoiceStatus]);

  const handleForceDowngrade = async () => {
    if (!downgradeTarget) return;
    try {
      await adminBilling.forceDowngrade(session?.role ?? null, downgradeTarget.user_id);
      toast(`Đã hạ gói của ${downgradeTarget.user_email} xuống Free`);
      setDowngradeTarget(null);
      loadSubs();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    }
  };

  const handleRefund = async () => {
    if (!refundTarget) return;
    try {
      const res = await adminBilling.refund(session?.role ?? null, refundTarget.id);
      toast(`Yêu cầu hoàn tiền đã gửi (Polar refund: ${res.polar_refund_id})`);
      setRefundTarget(null);
      loadInvoices();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
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
                    <td>{s.user_email}</td>
                    <td className={shared.mutedCell}>{s.tier}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className={shared.mutedCell}>{formatDate(s.started_at)}</td>
                    <td className={shared.mutedCell}>{formatDate(s.expires_at)}</td>
                    <td className={shared.mutedCell}>{s.cancel_at_period_end ? 'Có' : 'Không'}</td>
                    <td>
                      <button
                        className={shared.iconBtn}
                        title={isAdmin ? 'Buộc hạ xuống Free' : 'Chỉ Admin mới được thực hiện'}
                        disabled={!isAdmin || s.tier === 'free'}
                        onClick={() => setDowngradeTarget(s)}
                      >
                        <ArrowDownCircle size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {subs.length === 0 && (
                  <tr><td colSpan={7}><div className={shared.emptyState}>Không có subscription phù hợp.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {subHasMore && (
            <div className={shared.loadMoreRow}>
              <button className={shared.textBtn} onClick={() => loadSubs(subs[subs.length - 1]?.started_at)}>Tải thêm</button>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="invoices">
          <div className={shared.toolbar} style={{ marginBottom: 16 }}>
            <Select value={invoiceStatus} onValueChange={setInvoiceStatus} options={INVOICE_STATUS_OPTIONS} ariaLabel="Lọc trạng thái hóa đơn" />
          </div>
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
                    <td>{inv.user_email}</td>
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
                        disabled={!isAdmin || inv.status !== 'paid' || inv.payment_method !== 'polar'}
                        onClick={() => setRefundTarget(inv)}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={8}><div className={shared.emptyState}>Không có hóa đơn phù hợp.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {invoiceHasMore && (
            <div className={shared.loadMoreRow}>
              <button className={shared.textBtn} onClick={() => loadInvoices(invoices[invoices.length - 1]?.created_at)}>Tải thêm</button>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>

      <ConfirmDialog
        open={downgradeTarget !== null}
        onOpenChange={(open) => !open && setDowngradeTarget(null)}
        title={`Buộc hạ gói của ${downgradeTarget?.user_email ?? ''}?`}
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
