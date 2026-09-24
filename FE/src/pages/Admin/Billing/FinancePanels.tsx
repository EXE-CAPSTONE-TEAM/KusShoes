import React, { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Plus, X } from 'lucide-react';
import { adminApiCost, adminBilling, adminFinance, AdminApiError, type InvoiceListQuery } from '../../../api/adminClient';
import type { AdminApiBudget, AdminApiCostDailyRow, AdminCoupon, AdminInvoice, AdminTaxConfig, ReportingPeriod } from '../../../types/admin';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useToast } from '../../../context/ToastContext';
import { useCursorList } from '../../../hooks/useCursorList';
import { isValidUuid } from '../../../utils/validators';
import shared from '../admin-shared.module.css';

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
const errorText = (caught: unknown, fallback: string) => (caught instanceof AdminApiError || caught instanceof Error ? caught.message : fallback);
const today = () => new Date().toISOString().slice(0, 10);

const TIER_OPTIONS = [
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
];
const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Tháng' },
  { value: 'yearly', label: 'Năm' },
];
const MIME_BY_EXTENSION: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

// ---------------------------------------------------------------------------------------
// Manual transactions (BR-95): a maker records the payment, a second admin approves it.
// ---------------------------------------------------------------------------------------

export const ManualTransactionsPanel: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminInvoice | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({
    user_id: '',
    tier: 'basic',
    billing_cycle: 'monthly',
    amount_vnd: '',
    paid_on: today(),
    collected_by: '',
    reason: '',
  });
  const [proof, setProof] = useState<File | null>(null);

  const query: InvoiceListQuery = { is_manual: true };
  const fetcher = useCallback(
    (q: InvoiceListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminBilling.invoices(q, signal),
    [],
  );
  const { items, loading, hasMore, loadingMore, loadMore, reload } = useCursorList<AdminInvoice, InvoiceListQuery>({
    fetcher,
    query,
    getId: (invoice) => invoice.id,
  });

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast(errorText(caught, failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  const validForm =
    isValidUuid(form.user_id.trim()) &&
    Number(form.amount_vnd) > 0 &&
    form.collected_by.trim().length > 0 &&
    form.reason.trim().length > 0 &&
    proof !== null;

  const create = () =>
    run(async () => {
      if (!proof) return;
      const extension = proof.name.split('.').pop()?.toLowerCase() ?? '';
      const contentType = MIME_BY_EXTENSION[extension];
      if (!contentType) {
        toast('Chứng từ phải là ảnh JPG/PNG/WebP hoặc PDF.', 'error');
        return;
      }
      const upload = await adminFinance.proofUpload(proof.name, contentType);
      const put = await fetch(upload.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: proof });
      if (!put.ok) throw new Error('Không thể tải ảnh chứng từ lên kho lưu trữ.');
      await adminFinance.createManual({
        user_id: form.user_id.trim(),
        tier: form.tier as 'basic' | 'pro',
        billing_cycle: form.billing_cycle as 'monthly' | 'yearly',
        amount_vnd: Number(form.amount_vnd),
        paid_on: form.paid_on,
        collected_by: form.collected_by.trim(),
        proof_path: upload.file_path,
        reason: form.reason.trim(),
      });
      toast('Đã tạo giao dịch. Cần một admin khác duyệt.');
      setCreateOpen(false);
      setProof(null);
      setForm({ ...form, user_id: '', amount_vnd: '', collected_by: '', reason: '' });
      reload();
    }, 'Không thể tạo giao dịch.');

  return (
    <>
      <div className={shared.toolbar} style={{ marginBottom: 16 }}>
        <span className={shared.pageSubtitle}>
          Ghi nhận tiền mặt / chuyển khoản trực tiếp. Người tạo không được tự duyệt; giao dịch trong kỳ đã khóa bị từ chối.
        </span>
        <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Tạo giao dịch thủ công
        </button>
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead>
            <tr><th>Khách</th><th>Gói</th><th>Số tiền</th><th>Người thu</th><th>Trạng thái</th><th>Ngày</th><th>Biên nhận</th><th>Hành động</th></tr>
          </thead>
          <tbody>
            {items.map((invoice) => (
              <tr key={invoice.id}>
                <td className={shared.mutedCell}>{invoice.user_email ?? invoice.user_id}</td>
                <td className={shared.mutedCell} style={{ textTransform: 'capitalize' }}>{invoice.plan_tier} · {invoice.billing_cycle}</td>
                <td>{formatVnd(invoice.amount_vnd)}</td>
                <td className={shared.mutedCell}>{invoice.collected_by ?? '—'}</td>
                <td>
                  <StatusBadge
                    status={invoice.status}
                    tone={invoice.status === 'awaiting_approval' ? 'warn' : undefined}
                    label={invoice.status === 'awaiting_approval' ? 'Chờ duyệt' : undefined}
                  />
                </td>
                <td className={shared.mutedCell}>{formatDate(invoice.paid_at ?? invoice.created_at)}</td>
                <td className={shared.mutedCell}>{invoice.receipt_number ?? '—'}</td>
                <td>
                  {invoice.status === 'awaiting_approval' && (
                    <div className={shared.rowActions}>
                      <button
                        className={shared.iconBtn}
                        title="Duyệt"
                        disabled={!isAdmin || busy}
                        onClick={() => void run(async () => { await adminFinance.approveManual(invoice.id); toast('Đã duyệt. Gói đã được kích hoạt và biên nhận được phát hành.'); reload(); }, 'Không thể duyệt.')}
                      >
                        <Check size={14} />
                      </button>
                      <button className={`${shared.iconBtn} ${shared.iconBtnDanger}`} title="Từ chối" disabled={!isAdmin || busy} onClick={() => setRejectTarget(invoice)}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={8}><div className={shared.emptyState}>Chưa có giao dịch thủ công.</div></td></tr>}
            {loading && items.length === 0 && <tr><td colSpan={8}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Đang tải...' : 'Tải thêm'}</button>
        </div>
      )}

      <AdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo giao dịch thủ công"
        description="Cần ảnh chứng từ và lý do. Gói chỉ được kích hoạt sau khi admin thứ hai duyệt."
        submitLabel="Tạo giao dịch"
        busy={busy}
        submitDisabled={!validForm}
        onSubmit={() => void create()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>User ID (UUID)</label>
          <input className={shared.input} value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Gói</label>
          <Select value={form.tier} onValueChange={(value) => setForm({ ...form, tier: value })} options={TIER_OPTIONS} ariaLabel="Gói" />
        </div>
        <div className={shared.inputGroup}>
          <label>Chu kỳ</label>
          <Select value={form.billing_cycle} onValueChange={(value) => setForm({ ...form, billing_cycle: value })} options={CYCLE_OPTIONS} ariaLabel="Chu kỳ" />
        </div>
        <div className={shared.inputGroup}>
          <label>Số tiền thực thu (VNĐ)</label>
          <input className={shared.input} inputMode="numeric" value={form.amount_vnd} onChange={(event) => setForm({ ...form, amount_vnd: event.target.value.replace(/\D/g, '') })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Ngày thu tiền</label>
          <input className={shared.input} type="date" value={form.paid_on} onChange={(event) => setForm({ ...form, paid_on: event.target.value })} />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Người thu</label>
          <input className={shared.input} value={form.collected_by} maxLength={100} onChange={(event) => setForm({ ...form, collected_by: event.target.value })} />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Lý do / ghi chú</label>
          <input className={shared.input} value={form.reason} maxLength={500} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Ảnh chứng từ</label>
          <input className={shared.input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} />
        </div>
      </AdminDialog>

      <AdminDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(''); } }}
        title="Từ chối giao dịch thủ công"
        submitLabel="Từ chối"
        busy={busy}
        submitDisabled={!rejectReason.trim()}
        onSubmit={() =>
          void run(async () => {
            if (rejectTarget) await adminFinance.rejectManual(rejectTarget.id, rejectReason.trim());
            toast('Đã từ chối giao dịch.');
            setRejectTarget(null);
            setRejectReason('');
            reload();
          }, 'Không thể từ chối.')
        }
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Lý do</label>
          <input className={shared.input} value={rejectReason} maxLength={500} onChange={(event) => setRejectReason(event.target.value)} />
        </div>
      </AdminDialog>
    </>
  );
};

// ---------------------------------------------------------------------------------------
// Reporting periods (BR-98): once locked, manual transactions and refunds dated inside are refused.
// ---------------------------------------------------------------------------------------

export const PeriodsPanel: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [periods, setPeriods] = useState<ReportingPeriod[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState<ReportingPeriod | null>(null);
  const [form, setForm] = useState({ name: '', start_date: today(), end_date: today() });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeriods(await adminFinance.listPeriods());
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải kỳ báo cáo.'), 'error');
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast(errorText(caught, failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={shared.toolbar} style={{ marginBottom: 16 }}>
        <span className={shared.pageSubtitle}>Khóa sổ theo khoảng ngày (GMT+7). Khóa xong không thể mở lại.</span>
        <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setCreateOpen(true)}><Plus size={16} /> Tạo kỳ</button>
      </div>
      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead><tr><th>Tên kỳ</th><th>Từ ngày</th><th>Đến ngày</th><th>Trạng thái</th><th>Khóa lúc</th><th>Hành động</th></tr></thead>
          <tbody>
            {(periods ?? []).map((period) => (
              <tr key={period.id}>
                <td>{period.name}</td>
                <td className={shared.mutedCell}>{formatDate(period.start_date)}</td>
                <td className={shared.mutedCell}>{formatDate(period.end_date)}</td>
                <td><StatusBadge status={period.status} tone={period.status === 'locked' ? 'danger' : 'ok'} label={period.status === 'locked' ? 'Đã khóa' : 'Đang mở'} /></td>
                <td className={shared.mutedCell}>{formatDate(period.locked_at)}</td>
                <td>
                  <button className={shared.iconBtn} title="Khóa sổ" disabled={!isAdmin || busy || period.status === 'locked'} onClick={() => setLockTarget(period)}>
                    <Lock size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {periods !== null && periods.length === 0 && <tr><td colSpan={6}><div className={shared.emptyState}>Chưa có kỳ báo cáo.</div></td></tr>}
            {periods === null && <tr><td colSpan={6}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>

      <AdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo kỳ báo cáo"
        submitLabel="Tạo kỳ"
        busy={busy}
        submitDisabled={!form.name.trim() || form.end_date < form.start_date}
        onSubmit={() =>
          void run(async () => {
            await adminFinance.createPeriod({ name: form.name.trim(), start_date: form.start_date, end_date: form.end_date });
            toast('Đã tạo kỳ báo cáo.');
            setCreateOpen(false);
            setForm({ name: '', start_date: today(), end_date: today() });
            await load();
          }, 'Không thể tạo kỳ.')
        }
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Tên kỳ</label>
          <input className={shared.input} value={form.name} maxLength={100} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Từ ngày</label>
          <input className={shared.input} type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Đến ngày</label>
          <input className={shared.input} type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
        </div>
      </AdminDialog>

      <ConfirmDialog
        open={lockTarget !== null}
        onOpenChange={(open) => !open && setLockTarget(null)}
        title={`Khóa sổ kỳ “${lockTarget?.name ?? ''}”?`}
        description="Sau khi khóa, mọi giao dịch thủ công và hoàn tiền có ngày thuộc kỳ này sẽ bị từ chối. Không thể hoàn tác."
        confirmLabel="Khóa sổ"
        onConfirm={() =>
          void run(async () => {
            if (lockTarget) await adminFinance.lockPeriod(lockTarget.id);
            toast('Đã khóa kỳ báo cáo.');
            setLockTarget(null);
            await load();
          }, 'Không thể khóa kỳ.')
        }
      />
    </>
  );
};

// ---------------------------------------------------------------------------------------
// Coupons (BR-26)
// ---------------------------------------------------------------------------------------

const DISCOUNT_OPTIONS = [
  { value: 'percent', label: 'Giảm theo %' },
  { value: 'fixed', label: 'Giảm số tiền cố định' },
  { value: 'fixed_price', label: 'Đặt giá cố định' },
];

const describeDiscount = (coupon: AdminCoupon) =>
  coupon.discount_type === 'percent'
    ? `-${coupon.value}%`
    : coupon.discount_type === 'fixed'
      ? `-${formatVnd(coupon.value)}`
      : `Giá ${formatVnd(coupon.value)}`;

export const CouponsPanel: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    value: '',
    basic: true,
    pro: true,
    max_uses: '',
    valid_until: '',
  });

  const load = useCallback(async () => {
    try {
      setCoupons(await adminFinance.listCoupons());
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải mã giảm giá.'), 'error');
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast(errorText(caught, failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const tiers = [form.basic ? 'basic' : null, form.pro ? 'pro' : null].filter((tier): tier is string => tier !== null);
      await adminFinance.createCoupon({
        code: form.code.trim().toUpperCase(),
        discount_type: form.discount_type as AdminCoupon['discount_type'],
        value: Number(form.value),
        plan_tiers: tiers.length === 2 ? null : tiers,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_until: form.valid_until ? new Date(`${form.valid_until}T23:59:59+07:00`).toISOString() : null,
      });
      toast('Đã tạo mã giảm giá.');
      setCreateOpen(false);
      setForm({ ...form, code: '', value: '', max_uses: '', valid_until: '' });
      await load();
    }, 'Không thể tạo mã.');

  return (
    <>
      <div className={shared.toolbar} style={{ marginBottom: 16 }}>
        <span className={shared.pageSubtitle}>Mỗi tài khoản dùng một mã một lần. Không cộng dồn với giá nâng cấp pro-rata.</span>
        <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setCreateOpen(true)}><Plus size={16} /> Tạo mã</button>
      </div>
      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead><tr><th>Mã</th><th>Ưu đãi</th><th>Gói áp dụng</th><th>Đã dùng</th><th>Hết hạn</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {(coupons ?? []).map((coupon) => (
              <tr key={coupon.id}>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{coupon.code}</td>
                <td>{describeDiscount(coupon)}</td>
                <td className={shared.mutedCell}>{coupon.plan_tiers?.join(', ') ?? 'Tất cả'}</td>
                <td className={shared.mutedCell}>{coupon.used_count}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</td>
                <td className={shared.mutedCell}>{formatDate(coupon.valid_until)}</td>
                <td>
                  <label className={shared.switchLabel}>
                    <input
                      type="checkbox"
                      checked={coupon.is_active}
                      disabled={!isAdmin || busy}
                      onChange={(event) => void run(async () => { await adminFinance.updateCoupon(coupon.id, { is_active: event.target.checked }); await load(); }, 'Không thể cập nhật mã.')}
                    />
                    {coupon.is_active ? 'Đang bật' : 'Đã tắt'}
                  </label>
                </td>
              </tr>
            ))}
            {coupons !== null && coupons.length === 0 && <tr><td colSpan={6}><div className={shared.emptyState}>Chưa có mã giảm giá.</div></td></tr>}
            {coupons === null && <tr><td colSpan={6}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>

      <AdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo mã giảm giá"
        submitLabel="Tạo mã"
        busy={busy}
        submitDisabled={form.code.trim().length < 3 || !(Number(form.value) > 0) || (!form.basic && !form.pro)}
        onSubmit={() => void create()}
      >
        <div className={shared.inputGroup}>
          <label>Mã</label>
          <input className={shared.input} value={form.code} maxLength={40} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Loại ưu đãi</label>
          <Select value={form.discount_type} onValueChange={(value) => setForm({ ...form, discount_type: value })} options={DISCOUNT_OPTIONS} ariaLabel="Loại ưu đãi" />
        </div>
        <div className={shared.inputGroup}>
          <label>{form.discount_type === 'percent' ? 'Phần trăm giảm' : 'Số tiền (VNĐ)'}</label>
          <input className={shared.input} inputMode="numeric" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value.replace(/\D/g, '') })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Số lượt tối đa (để trống = không giới hạn)</label>
          <input className={shared.input} inputMode="numeric" value={form.max_uses} onChange={(event) => setForm({ ...form, max_uses: event.target.value.replace(/\D/g, '') })} />
        </div>
        <div className={shared.inputGroup}>
          <label>Hết hạn</label>
          <input className={shared.input} type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} />
        </div>
        <div className={`${shared.inputGroup}`}>
          <label>Gói áp dụng</label>
          <div className={shared.checkRow}>
            <label className={shared.checkRow}><input type="checkbox" checked={form.basic} onChange={(event) => setForm({ ...form, basic: event.target.checked })} /> Basic</label>
            <label className={shared.checkRow}><input type="checkbox" checked={form.pro} onChange={(event) => setForm({ ...form, pro: event.target.checked })} /> Pro</label>
          </div>
        </div>
      </AdminDialog>
    </>
  );
};

// ---------------------------------------------------------------------------------------
// VAT (BR-28): read-only — the rate/on-off switch lives in server config, not the DB.
// ---------------------------------------------------------------------------------------

export const TaxConfigPanel: React.FC = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<AdminTaxConfig | null>(null);

  useEffect(() => {
    adminFinance.taxConfig()
      .then(setConfig)
      .catch((caught) => toast(errorText(caught, 'Không thể tải cấu hình thuế.'), 'error'));
  }, [toast]);

  return (
    <div className={`${shared.tableWrap} glass-panel`} style={{ padding: 20 }}>
      <p className={shared.pageSubtitle} style={{ marginBottom: 16 }}>
        VAT được tách ra từ giá niêm yết (không cộng thêm) khi bật. Cấu hình theo biến môi trường của máy chủ — không
        chỉnh được tại đây.
      </p>
      {config ? (
        <div className={shared.checkRow} style={{ gap: 24 }}>
          <StatusBadge status={config.enabled ? 'Đang bật' : 'Đang tắt'} tone={config.enabled ? 'ok' : undefined} />
          <span>Thuế suất: <strong>{config.rate_percent}%</strong></span>
        </div>
      ) : (
        <div className={shared.emptyState}>Đang tải...</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------
// API cost tracker (SF-14 / BR-108): daily spend and a monthly budget with 80%/100% states.
// ---------------------------------------------------------------------------------------

const thisMonth = () => new Date().toISOString().slice(0, 7);
const BUDGET_STATE_LABEL: Record<string, string> = {
  unconfigured: 'Chưa đặt ngân sách',
  ok: 'Bình thường',
  warning: 'Đã vượt 80%',
  suspended: 'Đã tạm ngưng nhận Scan Job',
};
const BUDGET_STATE_TONE: Record<string, 'ok' | 'warn' | 'danger' | undefined> = {
  unconfigured: undefined,
  ok: 'ok',
  warning: 'warn',
  suspended: 'danger',
};

export const ApiCostPanel: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [daily, setDaily] = useState<AdminApiCostDailyRow[] | null>(null);
  const [budget, setBudget] = useState<AdminApiBudget | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [budgetInput, setBudgetInput] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBudget = useCallback(async (forMonth: string) => {
    try {
      const result = await adminApiCost.budget(`${forMonth}-01`);
      setBudget(result);
      setBudgetInput(result.budget_vnd !== null ? String(result.budget_vnd) : '');
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải ngân sách API.'), 'error');
    }
  }, [toast]);

  useEffect(() => {
    adminApiCost.daily().then(setDaily).catch((caught) => toast(errorText(caught, 'Không thể tải chi phí API.'), 'error'));
  }, [toast]);

  useEffect(() => { void loadBudget(month); }, [month, loadBudget]);

  const saveBudget = async () => {
    setBusy(true);
    try {
      const result = await adminApiCost.setBudget(`${month}-01`, Number(budgetInput));
      setBudget(result);
      toast('Đã cập nhật ngân sách API tháng.');
    } catch (caught) {
      toast(errorText(caught, 'Không thể cập nhật ngân sách.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`${shared.tableWrap} glass-panel`} style={{ padding: 20, marginBottom: 16 }}>
        <div className={shared.toolbar} style={{ marginBottom: 12 }}>
          <span className={shared.pageSubtitle}>Ngân sách API 3D/AI theo tháng. Cảnh báo ở 80%, tạm ngưng nhận Scan Job ở 100%.</span>
          <input className={shared.input} type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={{ maxWidth: 160 }} />
        </div>
        {budget && (
          <div className={shared.checkRow} style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={BUDGET_STATE_LABEL[budget.state] ?? budget.state} tone={BUDGET_STATE_TONE[budget.state]} />
            <span>Đã chi: <strong>{formatVnd(budget.spent_vnd)}</strong>{budget.percent !== null && ` (${budget.percent.toFixed(0)}%)`}</span>
            <input
              className={shared.input}
              inputMode="numeric"
              placeholder="Ngân sách (VNĐ)"
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value.replace(/\D/g, ''))}
              style={{ maxWidth: 160 }}
            />
            <button className="btn-neon-orange" disabled={!isAdmin || busy || !budgetInput} onClick={() => void saveBudget()}>
              Lưu ngân sách
            </button>
          </div>
        )}
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead><tr><th>Ngày</th><th>Số lần gọi</th><th>Thành công</th><th>Thất bại</th><th>Chi phí</th></tr></thead>
          <tbody>
            {(daily ?? []).map((row) => (
              <tr key={row.day}>
                <td>{formatDate(row.day)}</td>
                <td className={shared.mutedCell}>{row.calls}</td>
                <td className={shared.mutedCell}>{row.success_calls}</td>
                <td className={shared.mutedCell}>{row.failed_calls}</td>
                <td>{formatVnd(row.cost_vnd)}</td>
              </tr>
            ))}
            {daily !== null && daily.length === 0 && <tr><td colSpan={5}><div className={shared.emptyState}>Chưa có dữ liệu chi phí.</div></td></tr>}
            {daily === null && <tr><td colSpan={5}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
};
