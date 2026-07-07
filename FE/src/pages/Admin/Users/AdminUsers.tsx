import React, { useCallback, useState } from 'react';
import { Search, Eye, Ban, CheckCircle2, UserPlus, X, ShieldAlert, RotateCw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Select } from '../../../components/Select/Select';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminUsers, AdminApiError, type UserListQuery } from '../../../api/adminClient';
import { useCursorList } from '../../../hooks/useCursorList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import type { AdminUserDetail, AdminUserSummary, UserStatus, AdminRole } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const ROLE_OPTIONS = [
  { value: 'all', label: 'Tất cả role' },
  { value: 'user', label: 'User' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

export const AdminUsers: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const query: UserListQuery = {
    q: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : (statusFilter as UserStatus),
    role: roleFilter === 'all' ? undefined : (roleFilter as AdminRole),
    include_deleted: includeDeleted,
  };

  const fetcher = useCallback(
    (q: UserListQuery & { cursor?: string; limit?: number }, signal: AbortSignal) => adminUsers.list(q, signal),
    [],
  );

  const { items: users, loading, loadingMore, error, hasMore, reload, loadMore } =
    useCursorList<AdminUserSummary, UserListQuery>({
      fetcher,
      query,
      getId: (u) => u.id,
    });

  const [detailUser, setDetailUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [banTarget, setBanTarget] = useState<AdminUserSummary | null>(null);
  const [banReason, setBanReason] = useState('');
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: '', username: '', password: '', first_name: '', last_name: '' });
  const [mutating, setMutating] = useState(false);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setRoleFilter('all');
    setIncludeDeleted(false);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await adminUsers.detail(id);
      setDetailUser(detail);
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBanConfirm = async () => {
    if (!banTarget || mutating) return;
    setMutating(true);
    try {
      await adminUsers.ban(banTarget.id, banReason || 'Vi phạm điều khoản sử dụng');
      toast(`Đã khóa tài khoản ${banTarget.email}`);
      setBanTarget(null);
      setBanReason('');
      reload();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleUnban = async (user: AdminUserSummary) => {
    if (mutating) return;
    setMutating(true);
    try {
      await adminUsers.unban(user.id);
      toast(`Đã mở khóa tài khoản ${user.email}`);
      reload();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutating) return;
    setMutating(true);
    try {
      const created = await adminUsers.createStaff(staffForm);
      toast(`Đã tạo tài khoản Staff: ${created.email}`);
      setCreateStaffOpen(false);
      setStaffForm({ email: '', username: '', password: '', first_name: '', last_name: '' });
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
          <h1 className={shared.pageTitle}>Quản lý người dùng</h1>
          <p className={shared.pageSubtitle}>Tìm kiếm, khóa/mở khóa tài khoản, và tạo tài khoản Staff.</p>
        </div>
        {isAdmin ? (
          <button className="btn-neon-orange" onClick={() => setCreateStaffOpen(true)}>
            <UserPlus size={16} /> Tạo Staff
          </button>
        ) : (
          <span className={shared.forbiddenNote}><ShieldAlert size={14} /> Staff chỉ có quyền xem</span>
        )}
      </div>

      <div className={shared.toolbar}>
        <div className={`${shared.searchWrapper} glass-panel`}>
          <Search size={16} className={shared.searchIcon} />
          <input
            className={shared.searchInput}
            placeholder="Tìm theo email hoặc username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} ariaLabel="Lọc trạng thái" />
        <Select value={roleFilter} onValueChange={setRoleFilter} options={ROLE_OPTIONS} ariaLabel="Lọc role" />
        <label className={shared.switchLabel}>
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          Bao gồm tài khoản đã xóa
        </label>
        {(search || statusFilter !== 'all' || roleFilter !== 'all' || includeDeleted) && (
          <button className={shared.clearFiltersBtn} onClick={clearFilters}>Xóa bộ lọc</button>
        )}
      </div>

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
                <th>Email</th>
                <th>Username</th>
                <th>Mã tài khoản</th>
                <th>Role</th>
                <th>Trạng thái</th>
                <th>Xác thực</th>
                <th>Ngày tạo</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    {u.deleted_at && <span className={`${shared.badge} ${shared.badgeDanger}`} style={{ marginLeft: 8 }}>Đã xóa</span>}
                  </td>
                  <td className={shared.mutedCell}>{u.username}</td>
                  <td className={shared.mutedCell}>{u.account_code}</td>
                  <td><StatusBadge status={u.role} /></td>
                  <td><StatusBadge status={u.status} /></td>
                  <td className={shared.mutedCell}>{u.is_verified ? 'Đã xác thực' : 'Chưa xác thực'}</td>
                  <td className={shared.mutedCell}>{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                  <td>
                    <div className={shared.rowActions}>
                      <button className={shared.iconBtn} title="Xem chi tiết" onClick={() => openDetail(u.id)}>
                        <Eye size={14} />
                      </button>
                      {u.role === 'user' && u.status === 'active' && (
                        <button
                          className={`${shared.iconBtn} ${shared.iconBtnDanger}`}
                          title={isAdmin ? 'Khóa tài khoản' : 'Chỉ Admin mới được khóa tài khoản'}
                          disabled={!isAdmin || mutating}
                          onClick={() => setBanTarget(u)}
                        >
                          <Ban size={14} />
                        </button>
                      )}
                      {u.role === 'user' && u.status === 'suspended' && (
                        <button
                          className={shared.iconBtn}
                          title={isAdmin ? 'Mở khóa tài khoản' : 'Chỉ Admin mới được mở khóa tài khoản'}
                          disabled={!isAdmin || mutating}
                          onClick={() => handleUnban(u)}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={8}><div className={shared.emptyState}>Không tìm thấy người dùng phù hợp.</div></td></tr>
              )}
              {loading && users.length === 0 && (
                <tr><td colSpan={8}><div className={shared.emptyState}>Đang tải...</div></td></tr>
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

      {/* Detail Drawer */}
      {(detailUser || detailLoading) && (
        <>
          <div className={shared.overlay} onClick={() => setDetailUser(null)} />
          <div className={shared.drawer}>
            <div className={shared.drawerHeader}>
              <h3 className={shared.drawerTitle}>{detailUser?.email ?? 'Đang tải...'}</h3>
              <button className={shared.drawerCloseBtn} onClick={() => setDetailUser(null)}>
                <X size={18} />
              </button>
            </div>

            {detailUser && (
              <>
                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Thông tin tài khoản</span>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Họ tên</span><span className={shared.drawerRowValue}>{[detailUser.first_name, detailUser.last_name].filter(Boolean).join(' ') || '—'}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Username</span><span className={shared.drawerRowValue}>{detailUser.username}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Mã tài khoản</span><span className={shared.drawerRowValue}>{detailUser.account_code}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Role</span><span className={shared.drawerRowValue}><StatusBadge status={detailUser.role} /></span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Trạng thái</span><span className={shared.drawerRowValue}><StatusBadge status={detailUser.status} /></span></div>
                </div>

                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Subscription</span>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Gói</span><span className={shared.drawerRowValue}>{detailUser.subscription_tier ?? '—'}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Trạng thái</span><span className={shared.drawerRowValue}>{detailUser.subscription_status ? <StatusBadge status={detailUser.subscription_status} /> : '—'}</span></div>
                  <div className={shared.drawerRow}>
                    <span className={shared.drawerRowLabel}>Hết hạn</span>
                    <span className={shared.drawerRowValue}>
                      {detailUser.subscription_expires_at ? new Date(detailUser.subscription_expires_at).toLocaleDateString('vi-VN') : '—'}
                    </span>
                  </div>
                </div>

                <div className={shared.drawerSection}>
                  <span className={shared.drawerSectionTitle}>Hoạt động</span>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Project tháng này</span><span className={shared.drawerRowValue}>{detailUser.projects_count_this_month}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Export tháng này</span><span className={shared.drawerRowValue}>{detailUser.exports_count_this_month}</span></div>
                  <div className={shared.drawerRow}><span className={shared.drawerRowLabel}>Tổng project</span><span className={shared.drawerRowValue}>{detailUser.total_projects}</span></div>
                </div>

                {detailUser.role === 'user' && (
                  <div className={shared.drawerActions}>
                    {detailUser.status === 'active' ? (
                      <button
                        className="btn-outline"
                        disabled={!isAdmin || mutating}
                        onClick={() => { setBanTarget(detailUser); setDetailUser(null); }}
                      >
                        Khóa tài khoản
                      </button>
                    ) : (
                      <button className="btn-outline" disabled={!isAdmin || mutating} onClick={() => { handleUnban(detailUser); setDetailUser(null); }}>
                        Mở khóa tài khoản
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Ban confirm */}
      <ConfirmDialog
        open={banTarget !== null}
        onOpenChange={(open) => { if (!open) { setBanTarget(null); setBanReason(''); } }}
        title={`Khóa tài khoản ${banTarget?.email ?? ''}?`}
        description="Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa lại."
        confirmLabel="Khóa tài khoản"
        onConfirm={handleBanConfirm}
      />

      {/* Create Staff dialog */}
      <Dialog.Root open={createStaffOpen} onOpenChange={setCreateStaffOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={shared.dialogOverlay} />
          <Dialog.Content className={shared.dialogContent}>
            <Dialog.Title className={shared.dialogTitle}>Tạo tài khoản Staff</Dialog.Title>
            <Dialog.Description className={shared.dialogDescription}>
              Staff có quyền xem toàn bộ dữ liệu nhưng không thể thực hiện thao tác ghi.
            </Dialog.Description>
            <form onSubmit={handleCreateStaff}>
              <div className={shared.formGrid}>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label>Email</label>
                  <input
                    className={shared.input}
                    type="email"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  />
                </div>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label>Username</label>
                  <input
                    className={shared.input}
                    required
                    value={staffForm.username}
                    onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                  />
                </div>
                <div className={shared.inputGroup}>
                  <label>Họ</label>
                  <input
                    className={shared.input}
                    required
                    value={staffForm.first_name}
                    onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                  />
                </div>
                <div className={shared.inputGroup}>
                  <label>Tên</label>
                  <input
                    className={shared.input}
                    required
                    value={staffForm.last_name}
                    onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                  />
                </div>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label>Mật khẩu tạm thời</label>
                  <input
                    className={shared.input}
                    type="password"
                    required
                    minLength={8}
                    value={staffForm.password}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  />
                </div>
              </div>
              <div className={shared.dialogActions}>
                <Dialog.Close asChild>
                  <button type="button" className="btn-outline">Hủy</button>
                </Dialog.Close>
                <button type="submit" className="btn-neon-orange" disabled={mutating}>Tạo Staff</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
