import React, { useCallback, useState } from 'react';
import { RefreshCw, Ban, ShieldAlert, Eye, X, Copy, RotateCw } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminBakeJobs, AdminApiError, type BakeJobListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { isValidUuid } from '../../../utils/validators';
import type { AdminBakeJob, BakePriority } from '../../../types/admin';
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
  const { isAdmin } = useAdminAuth();
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectIdError, setProjectIdError] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const query: BakeJobListQuery = {
    status: status === 'all' ? undefined : status,
    priority: priority === 'all' ? undefined : (priority as BakePriority),
    project_id: projectId,
  };
  const fetcher = useCallback(
    (q: BakeJobListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminBakeJobs.list(q, signal),
    [],
  );
  const { items: jobs, loading, loadingMore, error, hasMore, reload, loadMore } =
    useCursorList<AdminBakeJob, BakeJobListQuery>({ fetcher, query, getId: (j) => j.id });

  const detailFetcher = useCallback(
    (signal: AbortSignal) => adminBakeJobs.detail(detailJobId as string, signal),
    [detailJobId],
  );
  const { data: detail, loading: detailLoading, error: detailError, reload: reloadDetail } =
    useAsyncData(detailFetcher, detailJobId !== null);

  const submitProjectId = () => {
    const trimmed = projectIdInput.trim();
    if (!trimmed) {
      setProjectIdError(null);
      setProjectId(undefined);
      return;
    }
    if (!isValidUuid(trimmed)) {
      setProjectIdError('Project ID phải là UUID hợp lệ.');
      return;
    }
    setProjectIdError(null);
    setProjectId(trimmed);
  };

  const clearFilters = () => {
    setStatus('all');
    setPriority('all');
    setProjectIdInput('');
    setProjectId(undefined);
    setProjectIdError(null);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã copy ${label}`);
    } catch {
      toast('Không thể copy vào clipboard', 'error');
    }
  };

  const handleRequeue = async (job: AdminBakeJob) => {
    if (mutating) return;
    setMutating(true);
    try {
      await adminBakeJobs.requeue(job.id);
      toast(`Đã requeue bake job của project ${job.project_name ?? job.project_id}`);
      reload();
      if (detailJobId === job.id) reloadDetail();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleCancel = async (job: AdminBakeJob) => {
    if (mutating) return;
    setMutating(true);
    try {
      await adminBakeJobs.cancel(job.id);
      toast(`Đã hủy bake job của project ${job.project_name ?? job.project_id}`);
      reload();
      if (detailJobId === job.id) reloadDetail();
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
        <input
          className={`${shared.filterInput} ${projectIdError ? shared.filterInputError : ''}`}
          placeholder="Project ID (UUID)..."
          value={projectIdInput}
          onChange={(e) => setProjectIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitProjectId(); }}
          onBlur={submitProjectId}
        />
        {(status !== 'all' || priority !== 'all' || projectId) && (
          <button className={shared.clearFiltersBtn} onClick={clearFilters}>Xóa bộ lọc</button>
        )}
      </div>
      {projectIdError && <p className={shared.errorMessage}>{projectIdError}</p>}

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
                  <td className={shared.mutedCell} title={job.project_id}>{job.project_name ?? job.project_id}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td><StatusBadge status={job.priority} tone={job.priority === 'high' ? 'ok' : job.priority === 'low' ? 'muted' : 'info'} /></td>
                  <td className={shared.mutedCell}>{job.worker_id ?? '—'}</td>
                  <td className={shared.mutedCell} style={{ maxWidth: 220, whiteSpace: 'normal' }}>{job.error_message ?? '—'}</td>
                  <td className={shared.mutedCell}>{formatDateTime(job.queued_at)}</td>
                  <td>
                    <div className={shared.rowActions}>
                      <button className={shared.iconBtn} title="Xem chi tiết" onClick={() => setDetailJobId(job.id)}>
                        <Eye size={14} />
                      </button>
                      {job.status === 'failed' && (
                        <button
                          className={shared.iconBtn}
                          title={isAdmin ? 'Requeue job' : 'Chỉ Admin mới được thực hiện'}
                          disabled={!isAdmin || mutating}
                          onClick={() => handleRequeue(job)}
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      {job.status === 'queued' && (
                        <button
                          className={`${shared.iconBtn} ${shared.iconBtnDanger}`}
                          title={isAdmin ? 'Hủy job' : 'Chỉ Admin mới được thực hiện'}
                          disabled={!isAdmin || mutating}
                          onClick={() => handleCancel(job)}
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && jobs.length === 0 && (
                <tr><td colSpan={7}><div className={shared.emptyState}>Không có bake job phù hợp.</div></td></tr>
              )}
              {loading && jobs.length === 0 && (
                <tr><td colSpan={7}><div className={shared.emptyState}>Đang tải...</div></td></tr>
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

      {detailJobId && (
        <>
          <div className={shared.overlay} onClick={() => setDetailJobId(null)} />
          <div className={shared.drawer}>
            <div className={shared.drawerHeader}>
              <h3 className={shared.drawerTitle}>{detail?.project_name ?? detail?.project_id ?? 'Bake Job'}</h3>
              <button className={shared.drawerCloseBtn} onClick={() => setDetailJobId(null)}><X size={18} /></button>
            </div>

            {detailLoading && <div className={shared.emptyState}>Đang tải...</div>}

            {detailError && !detailLoading && (
              <div className={shared.errorState}>
                <span className={shared.errorMessage}>{detailError}</span>
                <button className={shared.retryBtn} onClick={reloadDetail}><RotateCw size={14} /> Thử lại</button>
              </div>
            )}

            {detail && !detailLoading && !detailError && (
              <>
                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Thông tin</span>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Job ID</span>
                    <span className={shared.drawerRowValue}>
                      {detail.id}
                      <button className={shared.iconBtn} style={{ marginLeft: 8 }} title="Copy Job ID" onClick={() => copyToClipboard(detail.id, 'Job ID')}>
                        <Copy size={12} />
                      </button>
                    </span>
                  </div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Project</span>
                    <span className={shared.drawerRowValue}>
                      {detail.project_name ?? '—'}
                      <span className={shared.subText}>{detail.project_id}</span>
                    </span>
                  </div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Trạng thái</span><span className={shared.drawerRowValue}><StatusBadge status={detail.status} /></span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Ưu tiên</span><span className={shared.drawerRowValue}><StatusBadge status={detail.priority} tone={detail.priority === 'high' ? 'ok' : detail.priority === 'low' ? 'muted' : 'info'} /></span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Worker</span><span className={shared.drawerRowValue}>{detail.worker_id ?? '—'}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Queued lúc</span><span className={shared.drawerRowValue}>{formatDateTime(detail.queued_at)}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Bắt đầu lúc</span><span className={shared.drawerRowValue}>{formatDateTime(detail.started_at)}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Hoàn thành lúc</span><span className={shared.drawerRowValue}>{formatDateTime(detail.completed_at)}</span></div>
                  {detail.error_message && (
                    <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Lỗi</span><span className={shared.drawerRowValue}>{detail.error_message}</span></div>
                  )}
                </div>

                <div className={shared.drawerSection}>
                  <div className={shared.drawerHeader}>
                    <span className={shared.drawerSectionTitle}>Design Config Snapshot</span>
                    <button
                      className={shared.iconBtn}
                      title="Copy JSON"
                      onClick={() => copyToClipboard(JSON.stringify(detail.design_config_snapshot, null, 2), 'JSON snapshot')}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <pre className={shared.jsonBlock}>{JSON.stringify(detail.design_config_snapshot, null, 2)}</pre>
                </div>

                {isAdmin && (detail.status === 'failed' || detail.status === 'queued') && (
                  <div className={shared.drawerActions}>
                    {detail.status === 'failed' && (
                      <button className="btn-outline" disabled={mutating} onClick={() => handleRequeue(detail)}>
                        <RefreshCw size={16} /> Requeue
                      </button>
                    )}
                    {detail.status === 'queued' && (
                      <button className="btn-outline" disabled={mutating} onClick={() => handleCancel(detail)}>
                        <Ban size={16} /> Hủy job
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
