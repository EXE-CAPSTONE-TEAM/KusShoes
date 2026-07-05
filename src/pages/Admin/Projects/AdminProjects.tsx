import React, { useEffect, useState } from 'react';
import { Search, Eye, Trash2, ShieldAlert, X } from 'lucide-react';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminProjects, AdminApiError } from '../../../api/adminClient';
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
  const { isAdmin, session } = useAdminAuth();
  const [projects, setProjects] = useState<AdminProjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<AdminProjectDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectSummary | null>(null);

  const load = async (before?: string) => {
    const result = await adminProjects.list({
      q: search || undefined,
      status: status === 'all' ? undefined : status,
      limit: 20,
      before,
    });
    setProjects(prev => (before ? [...prev, ...result] : result));
    setHasMore(result.length === 20);
  };

  useEffect(() => { load(); }, [search, status]);

  const openDetail = async (id: string) => {
    const d = await adminProjects.detail(id);
    setDetail(d);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminProjects.remove(session?.role ?? null, deleteTarget.id);
      toast(`Đã xóa project "${deleteTarget.name}" (soft-delete)`);
      setDeleteTarget(null);
      setDetail(null);
      load();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
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
      </div>

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
                <td className={shared.mutedCell}>{p.owner_email}</td>
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
                      disabled={!isAdmin || !!p.deleted_at}
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={6}><div className={shared.emptyState}>Không tìm thấy project phù hợp.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className={shared.loadMoreRow}>
          <button className={shared.textBtn} onClick={() => load(projects[projects.length - 1]?.created_at)}>Tải thêm</button>
        </div>
      )}

      {detail && (
        <>
          <div className={shared.overlay} onClick={() => setDetail(null)} />
          <div className={shared.drawer}>
            <div className={shared.drawerHeader}>
              <h3 className={shared.drawerTitle}>{detail.name}</h3>
              <button className={shared.drawerCloseBtn} onClick={() => setDetail(null)}><X size={18} /></button>
            </div>
            <div className={shared.drawerSection}>
              <span className={shared.drawerSectionTitle}>Thông tin</span>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Chủ sở hữu</span><span className={shared.drawerRowValue}>{detail.owner_email}</span></div>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Trạng thái</span><span className={shared.drawerRowValue}><StatusBadge status={detail.status} /></span></div>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Số lượng asset</span><span className={shared.drawerRowValue}>{detail.asset_count}</span></div>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Bake gần nhất</span><span className={shared.drawerRowValue}>{detail.latest_bake_status ? <StatusBadge status={detail.latest_bake_status} /> : '—'}</span></div>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Tạo lúc</span><span className={shared.drawerRowValue}>{formatDate(detail.created_at)}</span></div>
              <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Cập nhật lúc</span><span className={shared.drawerRowValue}>{formatDate(detail.updated_at)}</span></div>
            </div>
            <div className={shared.drawerSection}>
              <span className={shared.drawerSectionTitle}>Mô tả</span>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.6 }}>{detail.description}</p>
            </div>
            {!detail.deleted_at && (
              <div className={shared.drawerActions}>
                <button
                  className="btn-outline"
                  disabled={!isAdmin}
                  onClick={() => setDeleteTarget(detail)}
                >
                  <Trash2 size={16} /> Xóa project
                </button>
              </div>
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
