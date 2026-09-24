import React, { useState } from 'react';
import { Gift, KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { api } from '../../../api/client';
import { adminModeration, adminUserActions, AdminApiError } from '../../../api/adminClient';
import type { AdminUserSummary, ModerationAction } from '../../../types/admin';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { Select } from '../../../components/Select/Select';
import { useToast } from '../../../context/ToastContext';
import shared from '../admin-shared.module.css';

interface UserSupportActionsProps {
  user: AdminUserSummary;
  /** Only role `admin` may perform these; staff sees them disabled. */
  allowed: boolean;
}

const TIERS = [{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }];
const CYCLES = [{ value: 'monthly', label: 'Tháng' }, { value: 'yearly', label: 'Năm' }];

const errorText = (caught: unknown, fallback: string) => (caught instanceof AdminApiError || caught instanceof Error ? caught.message : fallback);
const formatDate = (iso: string) => new Date(iso).toLocaleString('vi-VN');
const ACTION_LABEL: Record<string, string> = { warning: 'Cảnh cáo', share_restriction: 'Hạn chế chia sẻ 30 ngày', ban: 'Khóa tài khoản' };

/** Support tools for one customer: complimentary plan (BR-103), act-as (BR-80), password-reset email. */
export const UserSupportActions: React.FC<UserSupportActionsProps> = ({ user, allowed }) => {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<'grant' | 'impersonate' | 'reset' | 'moderation' | null>(null);
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState({ tier: 'pro', billing_cycle: 'monthly', days: '30', reason: '' });
  const [impersonationReason, setImpersonationReason] = useState('');
  const [moderationHistory, setModerationHistory] = useState<ModerationAction[] | null>(null);

  const close = () => setDialog(null);
  const title = (label: string) => (allowed ? label : 'Chỉ Admin mới được thực hiện');

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

  const grantPlan = () =>
    run(async () => {
      await adminUserActions.grantPlan(user.id, {
        tier: grant.tier as 'basic' | 'pro',
        billing_cycle: grant.billing_cycle as 'monthly' | 'yearly',
        days: Number(grant.days),
        reason: grant.reason.trim(),
      });
      toast(`Đã cấp gói ${grant.tier} (${grant.days} ngày) cho ${user.email}. Không tạo doanh thu.`);
      close();
      setGrant({ ...grant, reason: '' });
    }, 'Không thể cấp gói.');

  const impersonate = () =>
    run(async () => {
      const result = await adminUserActions.impersonate(user.id, impersonationReason.trim());
      // Hand the 30-minute token to the portal client and open the customer's dashboard in place.
      api.startImpersonation(result.access_token, { banner: result.banner, expiresAt: result.expires_at });
      close();
      setImpersonationReason('');
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 'Không thể bắt đầu phiên đăng nhập thay.');

  const resetPassword = () =>
    run(async () => {
      const result = await adminUserActions.resetPassword(user.id);
      toast(result.message);
      close();
    }, 'Không thể gửi mã đặt lại mật khẩu.');

  const openModerationHistory = () =>
    run(async () => {
      setModerationHistory(await adminModeration.userActions(user.id));
      setDialog('moderation');
    }, 'Không thể tải lịch sử vi phạm.');

  return (
    <>
      <button className={shared.iconBtn} title={title('Cấp gói tặng (COMP)')} disabled={!allowed || busy} onClick={() => setDialog('grant')}>
        <Gift size={14} />
      </button>
      <button className={shared.iconBtn} title={title('Đăng nhập thay (cần 2FA)')} disabled={!allowed || busy} onClick={() => setDialog('impersonate')}>
        <UserCog size={14} />
      </button>
      <button className={shared.iconBtn} title={title('Gửi mã đặt lại mật khẩu')} disabled={!allowed || busy} onClick={() => setDialog('reset')}>
        <KeyRound size={14} />
      </button>
      <button className={shared.iconBtn} title="Lịch sử vi phạm (BR-77)" disabled={busy} onClick={() => void openModerationHistory()}>
        <ShieldAlert size={14} />
      </button>

      <AdminDialog
        open={dialog === 'grant'}
        onOpenChange={(open) => !open && close()}
        title={`Cấp gói tặng cho ${user.email}`}
        description="Gói tặng không tạo giao dịch và không tính vào doanh thu hay KPI khách trả tiền."
        submitLabel="Cấp gói"
        busy={busy}
        submitDisabled={!grant.reason.trim() || !(Number(grant.days) >= 1 && Number(grant.days) <= 365)}
        onSubmit={() => void grantPlan()}
      >
        <div className={shared.inputGroup}>
          <label>Gói</label>
          <Select value={grant.tier} onValueChange={(value) => setGrant({ ...grant, tier: value })} options={TIERS} ariaLabel="Gói" />
        </div>
        <div className={shared.inputGroup}>
          <label>Chu kỳ</label>
          <Select value={grant.billing_cycle} onValueChange={(value) => setGrant({ ...grant, billing_cycle: value })} options={CYCLES} ariaLabel="Chu kỳ" />
        </div>
        <div className={shared.inputGroup}>
          <label>Số ngày (1–365)</label>
          <input className={shared.input} inputMode="numeric" value={grant.days} onChange={(event) => setGrant({ ...grant, days: event.target.value.replace(/\D/g, '') })} />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Lý do</label>
          <input className={shared.input} value={grant.reason} maxLength={500} onChange={(event) => setGrant({ ...grant, reason: event.target.value })} />
        </div>
      </AdminDialog>

      <AdminDialog
        open={dialog === 'impersonate'}
        onOpenChange={(open) => !open && close()}
        title={`Đăng nhập thay ${user.email}`}
        description="Tối đa 30 phút. Không thể thanh toán, đổi mật khẩu, xóa tài khoản hay xem cài đặt 2FA. Khách nhận email sau phiên. Admin cần đã bật 2FA."
        submitLabel="Bắt đầu phiên"
        busy={busy}
        submitDisabled={impersonationReason.trim().length < 5}
        onSubmit={() => void impersonate()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Lý do / mã ticket (tối thiểu 5 ký tự)</label>
          <input className={shared.input} value={impersonationReason} maxLength={500} onChange={(event) => setImpersonationReason(event.target.value)} />
        </div>
      </AdminDialog>

      <ConfirmDialog
        open={dialog === 'reset'}
        onOpenChange={(open) => !open && close()}
        title={`Gửi mã đặt lại mật khẩu tới ${user.email}?`}
        description="Khách nhận mã 6 số qua email và tự đặt mật khẩu mới. Admin không nhìn thấy hay đặt mật khẩu."
        confirmLabel="Gửi mã"
        danger={false}
        onConfirm={() => void resetPassword()}
      />

      <AdminDialog
        open={dialog === 'moderation'}
        onOpenChange={(open) => !open && close()}
        title={`Lịch sử vi phạm — ${user.email}`}
        description="Các mức xử lý đã áp dụng cho tài khoản này theo BR-77."
        submitLabel="Đóng"
        onSubmit={close}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          {moderationHistory && moderationHistory.length > 0 ? (
            <table className={shared.table}>
              <thead><tr><th>Mức</th><th>Hành động</th><th>Lý do</th><th>Ngày</th></tr></thead>
              <tbody>
                {moderationHistory.map((action) => (
                  <tr key={action.id}>
                    <td>{action.level}</td>
                    <td>{ACTION_LABEL[action.action] ?? action.action}</td>
                    <td className={shared.mutedCell}>{action.reason}</td>
                    <td className={shared.mutedCell}>{formatDate(action.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={shared.emptyState}>Không có vi phạm nào được ghi nhận.</div>
          )}
        </div>
      </AdminDialog>
    </>
  );
};
