import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShieldOff, RotateCw } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminAuditLogs, type AuditLogListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { isValidUuid } from '../../../utils/validators';
import type { AdminAuditLog } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const TARGET_TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả chủ đề' },
  { value: 'user', label: 'Người dùng' },
  { value: 'staff', label: 'Nhân viên (Staff)' },
  { value: 'plan', label: 'Gói dịch vụ' },
  { value: 'project', label: 'Project' },
  { value: 'bake_job', label: 'Bake Job' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'invoice', label: 'Invoice' },
];

const ACTIONS_BY_TARGET: Record<string, { value: string; label: string }[]> = {
  user: [
    { value: 'user.ban', label: 'user.ban' },
    { value: 'user.unban', label: 'user.unban' },
  ],
  staff: [{ value: 'staff.create', label: 'staff.create' }],
  plan: [{ value: 'plan.update', label: 'plan.update' }],
  project: [{ value: 'project.delete', label: 'project.delete' }],
  bake_job: [
    { value: 'bake_job.requeue', label: 'bake_job.requeue' },
    { value: 'bake_job.cancel', label: 'bake_job.cancel' },
  ],
  subscription: [{ value: 'subscription.force_downgrade', label: 'subscription.force_downgrade' }],
  invoice: [{ value: 'invoice.refund', label: 'invoice.refund' }],
};

const ALL_ACTION_OPTIONS = [
  { value: 'all', label: 'Tất cả hành động' },
  ...Object.values(ACTIONS_BY_TARGET).flat(),
];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('vi-VN');

const ACTION_TONE = (action: string): 'danger' | 'warn' | 'info' | 'muted' => {
  if (action.includes('ban') || action.includes('delete')) return 'danger';
  if (action.includes('downgrade') || action.includes('cancel')) return 'warn';
  if (action.includes('create') || action.includes('update')) return 'info';
  return 'muted';
};

export const AdminAuditLogs: React.FC = () => {
  const { isAdmin } = useAdminAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [targetType, setTargetType] = useState('all');
  const [action, setAction] = useState('all');
  const [actorIdInput, setActorIdInput] = useState('');
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  const [actorIdError, setActorIdError] = useState<string | null>(null);
  const [targetIdInput, setTargetIdInput] = useState('');
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [targetIdError, setTargetIdError] = useState<string | null>(null);

  const actionOptions = useMemo(
    () => (targetType === 'all' ? ALL_ACTION_OPTIONS : [{ value: 'all', label: 'Tất cả hành động' }, ...(ACTIONS_BY_TARGET[targetType] ?? [])]),
    [targetType]
  );

  // Reset the action filter whenever the topic no longer contains it
  useEffect(() => {
    if (action !== 'all' && !actionOptions.some(opt => opt.value === action)) {
      setAction('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType]);

  const query: AuditLogListQuery = {
    q: debouncedSearch || undefined,
    target_type: targetType === 'all' ? undefined : targetType,
    action: action === 'all' ? undefined : action,
    actor_id: actorId,
    target_id: targetId,
  };
  const fetcher = useCallback(
    (q: AuditLogListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminAuditLogs.list(q, signal),
    [],
  );
  const { items: logs, loading, loadingMore, error, hasMore, reload, loadMore } =
    useCursorList<AdminAuditLog, AuditLogListQuery>({ fetcher, query, getId: (l) => l.id, enabled: isAdmin });

  const submitActorId = () => {
    const trimmed = actorIdInput.trim();
    if (!trimmed) { setActorIdError(null); setActorId(undefined); return; }
    if (!isValidUuid(trimmed)) { setActorIdError('Actor ID phải là UUID hợp lệ.'); return; }
    setActorIdError(null);
    setActorId(trimmed);
  };

  const submitTargetId = () => {
    const trimmed = targetIdInput.trim();
    if (!trimmed) { setTargetIdError(null); setTargetId(undefined); return; }
    if (!isValidUuid(trimmed)) { setTargetIdError('Target ID phải là UUID hợp lệ.'); return; }
    setTargetIdError(null);
    setTargetId(trimmed);
  };

  const clearFilters = () => {
    setSearch('');
    setTargetType('all');
    setAction('all');
    setActorIdInput(''); setActorId(undefined); setActorIdError(null);
    setTargetIdInput(''); setTargetId(undefined); setTargetIdError(null);
  };

  if (!isAdmin) {
    return (
      <div className={shared.page}>
        <div className={shared.pageHeader}>
          <div>
            <h1 className={shared.pageTitle}>Audit Logs</h1>
            <p className={shared.pageSubtitle}>Lịch sử thao tác ghi trên hệ thống.</p>
          </div>
        </div>
        <div className={`${shared.emptyState} glass-panel`} style={{ borderRadius: 'var(--border-radius-md)' }}>
          <ShieldOff size={28} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
          <p>Chỉ Admin mới có quyền truy cập Audit Logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Audit Logs</h1>
          <p className={shared.pageSubtitle}>Lịch sử toàn bộ thao tác ghi trên hệ thống, phân loại theo chủ đề (chỉ Admin).</p>
        </div>
      </div>

      <div className={shared.toolbar}>
        <div className={`${shared.searchWrapper} glass-panel`}>
          <Search size={16} className={shared.searchIcon} />
          <input
            className={shared.searchInput}
            placeholder="Tìm theo actor, action, target hoặc payload..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={targetType} onValueChange={setTargetType} options={TARGET_TYPE_OPTIONS} ariaLabel="Lọc theo chủ đề" />
        <Select value={action} onValueChange={setAction} options={actionOptions} ariaLabel="Lọc hành động" />
        <input
          className={`${shared.filterInput} ${actorIdError ? shared.filterInputError : ''}`}
          placeholder="Actor ID (UUID)..."
          value={actorIdInput}
          onChange={(e) => setActorIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitActorId(); }}
          onBlur={submitActorId}
        />
        <input
          className={`${shared.filterInput} ${targetIdError ? shared.filterInputError : ''}`}
          placeholder="Target ID (UUID)..."
          value={targetIdInput}
          onChange={(e) => setTargetIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitTargetId(); }}
          onBlur={submitTargetId}
        />
        {(search || targetType !== 'all' || action !== 'all' || actorId || targetId) && (
          <button className={shared.clearFiltersBtn} onClick={clearFilters}>Xóa bộ lọc</button>
        )}
      </div>
      {actorIdError && <p className={shared.errorMessage}>{actorIdError}</p>}
      {targetIdError && <p className={shared.errorMessage}>{targetIdError}</p>}

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
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Chủ đề</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className={shared.mutedCell}>{formatDateTime(log.created_at)}</td>
                  <td title={log.actor_id}>{log.actor_email ?? log.actor_id} <StatusBadge status={log.actor_role} /></td>
                  <td><StatusBadge status={log.target_type ?? 'system'} tone="muted" label={(log.target_type ?? 'system').replace('_', ' ')} /></td>
                  <td><StatusBadge status={log.action} tone={ACTION_TONE(log.action)} label={log.action} /></td>
                  <td className={shared.mutedCell}>{log.target_id ? `${log.target_id.slice(0, 12)}...` : '—'}</td>
                  <td className={shared.mutedCell} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                    {log.payload && Object.keys(log.payload).length > 0 ? JSON.stringify(log.payload) : '—'}
                  </td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6}><div className={shared.emptyState}>Không có audit log phù hợp.</div></td></tr>
              )}
              {loading && logs.length === 0 && (
                <tr><td colSpan={6}><div className={shared.emptyState}>Đang tải...</div></td></tr>
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
    </div>
  );
};
