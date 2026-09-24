import React, { useCallback, useState } from 'react';
import { Check, X } from 'lucide-react';
import { adminModeration, AdminApiError, type ContentReportListQuery } from '../../../api/adminClient';
import type { AdminContentReport, AdminContentReportDetail, ReportStatus } from '../../../types/admin';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useToast } from '../../../context/ToastContext';
import { useCursorList } from '../../../hooks/useCursorList';
import shared from '../admin-shared.module.css';

const errorText = (caught: unknown, fallback: string) => (caught instanceof AdminApiError || caught instanceof Error ? caught.message : fallback);
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'new', label: 'Mới' },
  { value: 'reviewing', label: 'Đang xử lý' },
  { value: 'upheld', label: 'Đã chấp nhận' },
  { value: 'dismissed', label: 'Đã từ chối' },
];

const REASON_LABEL: Record<string, string> = {
  copyright: 'Bản quyền',
  trademark: 'Thương hiệu',
  inappropriate: 'Nội dung không phù hợp',
  other: 'Khác',
};

const ACTION_LABEL: Record<string, string> = {
  warning: 'Cảnh cáo',
  share_restriction: 'Hạn chế chia sẻ 30 ngày',
  ban: 'Khóa tài khoản',
};

export const ModerationReportsPanel: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<AdminContentReportDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState<'uphold' | 'dismiss' | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [busy, setBusy] = useState(false);

  const query: ContentReportListQuery = statusFilter === 'all' ? {} : { status: statusFilter as ReportStatus };
  const fetcher = useCallback(
    (q: ContentReportListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminModeration.listReports(q, signal),
    [],
  );
  const { items, loading, hasMore, loadingMore, loadMore, reload } = useCursorList<AdminContentReport, ContentReportListQuery>({
    fetcher,
    query,
    getId: (report) => report.id,
  });

  const openDetail = async (reportId: string) => {
    try {
      setDetail(await adminModeration.getReport(reportId));
      setDetailOpen(true);
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải chi tiết báo cáo.'), 'error');
    }
  };

  const submitDecision = () =>
    (async () => {
      if (!detail || !decisionOpen) return;
      setBusy(true);
      try {
        if (decisionOpen === 'uphold') {
          await adminModeration.uphold(detail.id, resolutionNote.trim());
          toast('Đã chấp nhận báo cáo và áp mức xử lý.');
        } else {
          await adminModeration.dismiss(detail.id, resolutionNote.trim());
          toast('Đã từ chối báo cáo.');
        }
        setDecisionOpen(null);
        setResolutionNote('');
        setDetailOpen(false);
        reload();
      } catch (caught) {
        toast(errorText(caught, 'Không thể xử lý báo cáo.'), 'error');
      } finally {
        setBusy(false);
      }
    })();

  return (
    <>
      <div className={shared.toolbar} style={{ marginBottom: 16 }}>
        <Select value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTERS} ariaLabel="Lọc theo trạng thái" />
        <span className={shared.pageSubtitle}>
          Lần 1: cảnh cáo · Lần 2: hạn chế chia sẻ công khai 30 ngày · Lần 3: khóa tài khoản (BR-77).
        </span>
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead><tr><th>Lý do</th><th>Đối tượng</th><th>Trạng thái</th><th>Ngày báo cáo</th><th>Hành động</th></tr></thead>
          <tbody>
            {items.map((report) => (
              <tr key={report.id}>
                <td>{REASON_LABEL[report.reason] ?? report.reason}</td>
                <td className={shared.mutedCell}>{report.project_id ? `Dự án ${report.project_id.slice(0, 8)}` : report.template_id ? `Template ${report.template_id.slice(0, 8)}` : '—'}</td>
                <td>
                  <StatusBadge
                    status={report.status}
                    tone={report.status === 'upheld' ? 'danger' : report.status === 'dismissed' ? 'muted' : 'warn'}
                    label={{ new: 'Mới', reviewing: 'Đang xử lý', upheld: 'Đã chấp nhận', dismissed: 'Đã từ chối' }[report.status]}
                  />
                </td>
                <td className={shared.mutedCell}>{formatDate(report.created_at)}</td>
                <td>
                  <button className={shared.textBtn} onClick={() => void openDetail(report.id)}>Xem chi tiết</button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={5}><div className={shared.emptyState}>Chưa có báo cáo vi phạm.</div></td></tr>}
            {loading && items.length === 0 && <tr><td colSpan={5}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Đang tải...' : 'Tải thêm'}</button>
        </div>
      )}

      <AdminDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title="Chi tiết báo cáo vi phạm"
        submitLabel="Đóng"
        onSubmit={() => setDetailOpen(false)}
      >
        {detail && (
          <div className={`${shared.inputGroup} ${shared.formGridFull}`} style={{ gap: 12 }}>
            <p><strong>Lý do:</strong> {REASON_LABEL[detail.reason] ?? detail.reason}</p>
            <p><strong>Nội dung khiếu nại:</strong> {detail.details}</p>
            {detail.reporter_name && <p><strong>Người báo cáo:</strong> {detail.reporter_name}</p>}
            {detail.reporter_email && <p><strong>Email:</strong> {detail.reporter_email}</p>}
            {detail.evidence_url && (
              <p><strong>Bằng chứng:</strong> <a href={detail.evidence_url} target="_blank" rel="noopener noreferrer">{detail.evidence_url}</a></p>
            )}
            {detail.resolution_note && <p><strong>Ghi chú xử lý:</strong> {detail.resolution_note}</p>}

            {detail.user_actions.length > 0 && (
              <>
                <p><strong>Lịch sử xử lý tài khoản này:</strong></p>
                <table className={shared.table}>
                  <thead><tr><th>Mức</th><th>Hành động</th><th>Lý do</th><th>Ngày</th></tr></thead>
                  <tbody>
                    {detail.user_actions.map((action) => (
                      <tr key={action.id}>
                        <td>{action.level}</td>
                        <td>{ACTION_LABEL[action.action] ?? action.action}</td>
                        <td className={shared.mutedCell}>{action.reason}</td>
                        <td className={shared.mutedCell}>{formatDate(action.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {(detail.status === 'new' || detail.status === 'reviewing') && (
              <div className={shared.rowActions} style={{ marginTop: 8 }}>
                <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setDecisionOpen('uphold')}>
                  <Check size={14} /> Chấp nhận báo cáo
                </button>
                <button className="btn-outline" disabled={!isAdmin} onClick={() => setDecisionOpen('dismiss')}>
                  <X size={14} /> Từ chối báo cáo
                </button>
              </div>
            )}
          </div>
        )}
      </AdminDialog>

      <AdminDialog
        open={decisionOpen !== null}
        onOpenChange={(open) => { if (!open) { setDecisionOpen(null); setResolutionNote(''); } }}
        title={decisionOpen === 'uphold' ? 'Chấp nhận báo cáo vi phạm' : 'Từ chối báo cáo vi phạm'}
        description={
          decisionOpen === 'uphold'
            ? 'Sẽ áp mức xử lý kế tiếp theo BR-77 cho tài khoản bị báo cáo. Thao tác được ghi vào nhật ký.'
            : 'Đóng khiếu nại mà không áp mức xử lý nào.'
        }
        submitLabel={decisionOpen === 'uphold' ? 'Chấp nhận' : 'Từ chối'}
        busy={busy}
        submitDisabled={resolutionNote.trim().length < 5}
        onSubmit={submitDecision}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Ghi chú xử lý (tối thiểu 5 ký tự)</label>
          <input className={shared.input} value={resolutionNote} maxLength={1000} onChange={(event) => setResolutionNote(event.target.value)} />
        </div>
      </AdminDialog>
    </>
  );
};
