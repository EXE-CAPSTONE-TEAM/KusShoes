import React, { useCallback, useState } from 'react';
import { Search, Eye, Trash2, ShieldAlert, X, RotateCw } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminProjects, AdminApiError, type ProjectListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { isValidUuid } from '../../../utils/validators';
import type { AdminProjectDetail, AdminProjectSummary } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'baking', label: 'Baking' },
  { value: 'completed', label: 'Completed' },
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export const AdminProjects: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [status, setStatus] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userIdError, setUserIdError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AdminProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectSummary | AdminProjectDetail | null>(null);
  const [mutating, setMutating] = useState(false);

  const query: ProjectListQuery = {
    q: debouncedSearch || undefined,
    status: status === 'all' ? undefined : status,
    include_deleted: includeDeleted,
    user_id: userId,
  };
  const fetcher = useCallback(
    (q: ProjectListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminProjects.list(q, signal),
    [],
  );
  const { items: projects, loading, loadingMore, error, hasMore, reload, loadMore } =
    useCursorList<AdminProjectSummary, ProjectListQuery>({ fetcher, query, getId: (p) => p.id });

  const submitUserId = () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) {
      setUserIdError(null);
      setUserId(undefined);
      return;
    }
    if (!isValidUuid(trimmed)) {
      setUserIdError('User ID phải là UUID hợp lệ.');
      return;
    }
    setUserIdError(null);
    setUserId(trimmed);
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setIncludeDeleted(false);
    setUserIdInput('');
    setUserId(undefined);
    setUserIdError(null);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await adminProjects.detail(id);
      setDetail(d);
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || mutating) return;
    setMutating(true);
    try {
      await adminProjects.remove(deleteTarget.id);
      toast(`Đã xóa project "${deleteTarget.name}" (soft-delete)`);
      setDeleteTarget(null);
      setDetail(null);
      reload();
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
          <h1 className={shared.pageTitle}>Quản lý Project</h1>
          <p className={shared.pageSubtitle}>Xem và xóa (soft-delete) các project trên toàn hệ thống.</p>
        </div>
        {!isAdmin && (
          <span className={shared.forbiddenNote}><ShieldAlert size={14} /> Staff chỉ có quyền xem</span>
        )}
      </div>

      <div className={shared.toolbar}>
        <div className={`${shared.searchWrapper} glass-panel`}>
          <Search size={16} className={shared.searchIcon} />
          <input
            className={shared.searchInput}
            placeholder="Tìm theo tên project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Lọc trạng thái" />
        <input
          className={`${shared.filterInput} ${userIdError ? shared.filterInputError : ''}`}
          placeholder="User ID (UUID)..."
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitUserId(); }}
          onBlur={submitUserId}
        />
        <label className={shared.switchLabel}>
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          Bao gồm project đã xóa
        </label>
        {(search || status !== 'all' || includeDeleted || userId) && (
          <button className={shared.clearFiltersBtn} onClick={clearFilters}>Xóa bộ lọc</button>
        )}
      </div>
      {userIdError && <p className={shared.errorMessage}>{userIdError}</p>}

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
                <th>Tên project</th>
                <th>Chủ sở hữu</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th>Đã xóa</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className={shared.mutedCell} title={p.user_id}>{p.owner_email ?? p.user_id}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className={shared.mutedCell}>{formatDate(p.updated_at)}</td>
                  <td>{p.deleted_at ? <StatusBadge status="deleted" tone="danger" /> : <span className={shared.mutedCell}>—</span>}</td>
                  <td>
                    <div className={shared.rowActions}>
                      <button className={shared.iconBtn} title="Xem chi tiết" onClick={() => openDetail(p.id)}>
                        <Eye size={14} />
                      </button>
                      <button
                        className={`${shared.iconBtn} ${shared.iconBtnDanger}`}
                        title={isAdmin ? 'Xóa project' : 'Chỉ Admin mới được xóa'}
                        disabled={!isAdmin || !!p.deleted_at || mutating}
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && projects.length === 0 && (
                <tr><td colSpan={6}><div className={shared.emptyState}>Không tìm thấy project phù hợp.</div></td></tr>
              )}
              {loading && projects.length === 0 && (
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

      {(detail || detailLoading) && (
        <>
          <div className={shared.overlay} onClick={() => setDetail(null)} />
          <div className={shared.drawer}>
            <div className={shared.drawerHeader}>
              <h3 className={shared.drawerTitle}>{detail?.name ?? 'Đang tải...'}</h3>
              <button className={shared.drawerCloseBtn} onClick={() => setDetail(null)}><X size={18} /></button>
            </div>
            {detail && (
              <>
                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Thông tin</span>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Chủ sở hữu</span>
                    <span className={shared.drawerRowValue} title={detail.user_id}>
                      {detail.owner_email ?? detail.user_id}
                      {detail.owner_email && <span className={shared.subText}>{detail.user_id}</span>}
                    </span>
                  </div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Trạng thái</span><span className={shared.drawerRowValue}><StatusBadge status={detail.status} /></span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Số lượng asset</span><span className={shared.drawerRowValue}>{detail.asset_count}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Bake gần nhất</span><span className={shared.drawerRowValue}>{detail.latest_bake_status ? <StatusBadge status={detail.latest_bake_status} /> : '—'}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Tạo lúc</span><span className={shared.drawerRowValue}>{formatDate(detail.created_at)}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Cập nhật lúc</span><span className={shared.drawerRowValue}>{formatDate(detail.updated_at)}</span></div>
                </div>
                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Mô tả</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.6 }}>{detail.description ?? '—'}</p>
                </div>
                {!detail.deleted_at && (
                  <div className={shared.drawerActions}>
                    <button
                      className="btn-outline"
                      disabled={!isAdmin || mutating}
                      onClick={() => setDeleteTarget(detail)}
                    >
                      <Trash2 size={16} /> Xóa project
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Xóa project "${deleteTarget?.name ?? ''}"?`}
        description="Đây là soft-delete. File storage sẽ được lên lịch xóa sau 7 ngày."
        confirmLabel="Xóa project"
        onConfirm={handleDelete}
      />
    </div>
  );
};
