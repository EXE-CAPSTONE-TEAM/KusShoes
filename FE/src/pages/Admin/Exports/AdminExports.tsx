import React, { useCallback, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { adminExports, type ExportListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { isValidUuid } from '../../../utils/validators';
import type { AdminExport, ExportFormat } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const FORMAT_OPTIONS = [
  { value: 'all', label: 'Tất cả định dạng' },
  { value: 'glb', label: 'GLB' },
  { value: 'obj', label: 'OBJ' },
  { value: 'zip', label: 'ZIP' },
];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('vi-VN');

export const AdminExports: React.FC = () => {
  const [format, setFormat] = useState('all');
  const [userIdInput, setUserIdInput] = useState('');
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userIdError, setUserIdError] = useState<string | null>(null);
  const [projectIdInput, setProjectIdInput] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectIdError, setProjectIdError] = useState<string | null>(null);

  const query: ExportListQuery = {
    format: format === 'all' ? undefined : (format as ExportFormat),
    user_id: userId,
    project_id: projectId,
  };
  const fetcher = useCallback(
    (q: ExportListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminExports.list(q, signal),
    [],
  );
  const { items: exports, loading, loadingMore, error, hasMore, reload, loadMore } =
    useCursorList<AdminExport, ExportListQuery>({ fetcher, query, getId: (e) => e.id });

  const submitUserId = () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) { setUserIdError(null); setUserId(undefined); return; }
    if (!isValidUuid(trimmed)) { setUserIdError('User ID phải là UUID hợp lệ.'); return; }
    setUserIdError(null);
    setUserId(trimmed);
  };

  const submitProjectId = () => {
    const trimmed = projectIdInput.trim();
    if (!trimmed) { setProjectIdError(null); setProjectId(undefined); return; }
    if (!isValidUuid(trimmed)) { setProjectIdError('Project ID phải là UUID hợp lệ.'); return; }
    setProjectIdError(null);
    setProjectId(trimmed);
  };

  const clearFilters = () => {
    setFormat('all');
    setUserIdInput(''); setUserId(undefined); setUserIdError(null);
    setProjectIdInput(''); setProjectId(undefined); setProjectIdError(null);
  };

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Theo dõi Export</h1>
          <p className={shared.pageSubtitle}>Danh sách các lần export model trên toàn hệ thống (chỉ xem).</p>
        </div>
      </div>

      <div className={shared.toolbar}>
        <Select value={format} onValueChange={setFormat} options={FORMAT_OPTIONS} ariaLabel="Lọc định dạng" />
        <input
          className={`${shared.filterInput} ${userIdError ? shared.filterInputError : ''}`}
          placeholder="User ID (UUID)..."
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitUserId(); }}
          onBlur={submitUserId}
        />
        <input
          className={`${shared.filterInput} ${projectIdError ? shared.filterInputError : ''}`}
          placeholder="Project ID (UUID)..."
          value={projectIdInput}
          onChange={(e) => setProjectIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitProjectId(); }}
          onBlur={submitProjectId}
        />
        {(format !== 'all' || userId || projectId) && (
          <button className={shared.clearFiltersBtn} onClick={clearFilters}>Xóa bộ lọc</button>
        )}
      </div>
      {userIdError && <p className={shared.errorMessage}>{userIdError}</p>}
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
                <th>User</th>
                <th>Định dạng</th>
                <th>File Path</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {exports.map(exp => (
                <tr key={exp.id}>
                  <td className={shared.mutedCell} title={exp.project_id}>{exp.project_name ?? exp.project_id}</td>
                  <td className={shared.mutedCell} title={exp.user_id}>{exp.user_email ?? exp.user_id}</td>
                  <td style={{ textTransform: 'uppercase' }}>{exp.format}</td>
                  <td className={shared.mutedCell} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{exp.file_path}</td>
                  <td className={shared.mutedCell}>{formatDateTime(exp.created_at)}</td>
                </tr>
              ))}
              {!loading && exports.length === 0 && (
                <tr><td colSpan={5}><div className={shared.emptyState}>Không có export nào phù hợp.</div></td></tr>
              )}
              {loading && exports.length === 0 && (
                <tr><td colSpan={5}><div className={shared.emptyState}>Đang tải...</div></td></tr>
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
