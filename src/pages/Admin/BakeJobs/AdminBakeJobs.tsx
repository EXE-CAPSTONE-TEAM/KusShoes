import React, { useEffect, useState } from 'react';
import { RefreshCw, Ban, ShieldAlert } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminBakeJobs, AdminApiError } from '../../../api/adminClient';
import type { AdminBakeJob } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'Tất cả ưu tiên' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

export const AdminBakeJobs: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin, session } = useAdminAuth();
  const [jobs, setJobs] = useState<AdminBakeJob[]>([]);
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [hasMore, setHasMore] = useState(false);

  const load = async (before?: string) => {
    const result = await adminBakeJobs.list({
      status: status === 'all' ? undefined : status,
      priority: priority === 'all' ? undefined : (priority as any),
      limit: 20,
      before,
    });
    setJobs(prev => (before ? [...prev, ...result] : result));
    setHasMore(result.length === 20);
  };

  useEffect(() => { load(); }, [status, priority]);

  const handleRequeue = async (job: AdminBakeJob) => {
    try {
      await adminBakeJobs.requeue(session?.role ?? null, job.id);
      toast(`Đã requeue bake job cho "${job.project_name}"`);
      load();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    }
  };

  const handleCancel = async (job: AdminBakeJob) => {
    try {
      await adminBakeJobs.cancel(session?.role ?? null, job.id);
      toast(`Đã hủy bake job cho "${job.project_name}"`);
      load();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    }
  };

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Bake Jobs</h1>
          <p className={shared.pageSubtitle}>Theo dõi hàng đợi xử lý bake, requeue job lỗi hoặc hủy job đang chờ.</p>
        </div>
        {!isAdmin && (
          <span className={shared.forbiddenNote}><ShieldAlert size={14} /> Staff chỉ có quyền xem</span>
        )}
      </div>

      <div className={shared.toolbar}>
        <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Lọc trạng thái" />
        <Select value={priority} onValueChange={setPriority} options={PRIORITY_OPTIONS} ariaLabel="Lọc ưu tiên" />
      </div>

      <div className={`${shared.tableWrap} glass-panel`}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Project</th>
              <th>Trạng thái</th>
              <th>Ưu tiên</th>
              <th>Worker</th>
              <th>Lỗi</th>
              <th>Queued lúc</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id}>
                <td>{job.project_name}</td>
                <td><StatusBadge status={job.status} /></td>
                <td><StatusBadge status={job.priority} tone={job.priority === 'high' ? 'ok' : job.priority === 'low' ? 'muted' : 'info'} /></td>
                <td className={shared.mutedCell}>{job.worker_id ?? '—'}</td>
                <td className={shared.mutedCell} style={{ maxWidth: 220, whiteSpace: 'normal' }}>{job.error_message ?? '—'}</td>
                <td className={shared.mutedCell}>{formatDateTime(job.queued_at)}</td>
                <td>
                  <div className={shared.rowActions}>
                    {job.status === 'failed' && (
                      <button
                        className={shared.iconBtn}
                        title={isAdmin ? 'Requeue job' : 'Chỉ Admin mới được thực hiện'}
                        disabled={!isAdmin}
                        onClick={() => handleRequeue(job)}
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    {job.status === 'queued' && (
                      <button
                        className={`${shared.iconBtn} ${shared.iconBtnDanger}`}
                        title={isAdmin ? 'Hủy job' : 'Chỉ Admin mới được thực hiện'}
                        disabled={!isAdmin}
                        onClick={() => handleCancel(job)}
                      >
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7}><div className={shared.emptyState}>Không có bake job phù hợp.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={() => load(jobs[jobs.length - 1]?.queued_at)}>Tải thêm</button>
        </div>
      )}
    </div>
  );
};
