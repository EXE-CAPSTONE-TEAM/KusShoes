import React, { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, Star } from 'lucide-react';
import { adminFeedback, AdminApiError } from '../../../api/adminClient';
import type { AdminFeedback, FeedbackStatus, FeedbackSummary } from '../../../types/admin';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useToast } from '../../../context/ToastContext';
import shared from '../admin-shared.module.css';

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'Mới',
  reviewed: 'Đã xem',
  planned: 'Đã lên kế hoạch',
  done: 'Hoàn thành',
  wont_do: 'Không thực hiện',
};

const STATUS_TONE: Record<FeedbackStatus, 'warn' | 'info' | 'ok' | 'muted'> = {
  new: 'warn',
  reviewed: 'info',
  planned: 'info',
  done: 'ok',
  wont_do: 'muted',
};

const GROUP_LABELS: Record<string, string> = {
  product: 'Sản phẩm',
  price: 'Giá',
  place: 'Kênh phân phối',
  promotion: 'Truyền thông',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] })),
];
const GROUP_OPTIONS = [
  { value: 'all', label: 'Tất cả nhóm 4P' },
  ...Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label })),
];
const RATING_OPTIONS = [
  { value: 'all', label: 'Mọi điểm' },
  ...[5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} sao` })),
];
const EDIT_STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));

export const AdminFeedbackPage: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [status, setStatus] = useState('all');
  const [group, setGroup] = useState('all');
  const [rating, setRating] = useState('all');
  const [includeInternal, setIncludeInternal] = useState(false);
  const [editing, setEditing] = useState<AdminFeedback | null>(null);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('reviewed');
  const [changedWhat, setChangedWhat] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        adminFeedback.list({
          status: status === 'all' ? undefined : (status as FeedbackStatus),
          marketing_group: group === 'all' ? undefined : group,
          rating: rating === 'all' ? undefined : Number(rating),
          include_internal: includeInternal || undefined,
        }),
        adminFeedback.summary(),
      ]);
      setItems(list);
      setSummary(stats);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Không thể tải phản hồi.', 'error');
    }
  }, [status, group, rating, includeInternal, toast]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = (item: AdminFeedback) => {
    setEditing(item);
    setEditStatus(item.status === 'new' ? 'reviewed' : item.status);
    setChangedWhat(item.changed_what ?? '');
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await adminFeedback.update(editing.id, { status: editStatus, changed_what: changedWhat.trim() || null });
      toast('Đã cập nhật phản hồi.');
      setEditing(null);
      await load();
    } catch (caught) {
      toast(caught instanceof AdminApiError ? caught.message : 'Không thể cập nhật.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async () => {
    try {
      await adminFeedback.exportXlsx();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Không thể xuất file.', 'error');
    }
  };

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Phản hồi khách hàng</h1>
          <p className={shared.pageSubtitle}>Mỗi khách gửi 1 phiếu mỗi 14 ngày. Tài khoản nội bộ không tính vào thống kê.</p>
        </div>
        <button className="btn-outline" onClick={() => void exportFile()}><Download size={14} /> Xuất Excel</button>
      </div>

      <div className={shared.statsGrid}>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}>Số phản hồi</span>
          <span className={shared.statValue}>{summary?.count ?? '—'}</span>
        </div>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}>Điểm trung bình</span>
          <span className={shared.statValue}>{summary ? summary.average_rating.toFixed(2) : '—'}</span>
        </div>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}>Chưa xử lý</span>
          <span className={shared.statValue}>{summary?.by_status.new ?? 0}</span>
        </div>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}>Đã hoàn thành</span>
          <span className={shared.statValue}>{summary?.by_status.done ?? 0}</span>
        </div>
      </div>

      <div className={shared.toolbar}>
        <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Lọc trạng thái" />
        <Select value={group} onValueChange={setGroup} options={GROUP_OPTIONS} ariaLabel="Lọc nhóm 4P" />
        <Select value={rating} onValueChange={setRating} options={RATING_OPTIONS} ariaLabel="Lọc điểm" />
        <label className={shared.switchLabel}>
          <input type="checkbox" checked={includeInternal} onChange={(event) => setIncludeInternal(event.target.checked)} />
          Gồm tài khoản nội bộ
        </label>
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead>
            <tr><th>Khách</th><th>Điểm</th><th>Nhóm</th><th>Nội dung</th><th>Trạng thái</th><th>Ngày gửi</th><th>Hành động</th></tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td className={shared.mutedCell}>{item.user_email ?? item.user_id}{item.is_internal ? ' (nội bộ)' : ''}</td>
                <td>
                  <span style={{ color: 'var(--status-designing)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {item.rating} <Star size={12} fill="currentColor" />
                  </span>
                </td>
                <td className={shared.mutedCell}>{GROUP_LABELS[item.marketing_group] ?? item.marketing_group}</td>
                <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>
                  {item.message}
                  {item.changed_what && <div className={shared.subText}>Đã thay đổi: {item.changed_what}</div>}
                </td>
                <td><StatusBadge status={item.status} tone={STATUS_TONE[item.status]} label={STATUS_LABELS[item.status]} /></td>
                <td className={shared.mutedCell}>{new Date(item.created_at).toLocaleDateString('vi-VN')}</td>
                <td>
                  <button className={shared.iconBtn} title={isAdmin ? 'Xử lý' : 'Chỉ Admin mới được thực hiện'} disabled={!isAdmin} onClick={() => openEdit(item)}>
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {items !== null && items.length === 0 && (
              <tr><td colSpan={7}><div className={shared.emptyState}>Chưa có phản hồi phù hợp.</div></td></tr>
            )}
            {items === null && <tr><td colSpan={7}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>

      <AdminDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Xử lý phản hồi"
        description="Ghi chú “đã thay đổi gì” sẽ hiển thị cho khách hàng đã gửi phản hồi."
        submitLabel="Lưu"
        busy={busy}
        onSubmit={() => void save()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Trạng thái</label>
          <Select value={editStatus} onValueChange={(value) => setEditStatus(value as FeedbackStatus)} options={EDIT_STATUS_OPTIONS} ariaLabel="Trạng thái mới" />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Đã thay đổi gì</label>
          <textarea className={shared.input} style={{ minHeight: 100 }} maxLength={2000} value={changedWhat} onChange={(event) => setChangedWhat(event.target.value)} />
        </div>
      </AdminDialog>
    </div>
  );
};
