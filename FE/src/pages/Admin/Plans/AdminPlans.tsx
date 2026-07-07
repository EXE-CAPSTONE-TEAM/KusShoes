import React, { useCallback, useState } from 'react';
import { Pencil, ShieldAlert, RotateCw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { adminPlans, AdminApiError } from '../../../api/adminClient';
import { useAsyncData } from '../../../hooks/useAsyncData';
import type { AdminPlan, BakePriority, ExportFormat } from '../../../types/admin';
import shared from '../admin-shared.module.css';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const FORMAT_OPTIONS: ExportFormat[] = ['glb', 'obj', 'zip'];

export const AdminPlans: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const listFetcher = useCallback(() => adminPlans.list(), []);
  const { data: plansData, loading, error, reload } = useAsyncData(listFetcher);
  const plans = plansData ?? [];
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<Partial<AdminPlan>>({});
  const [saving, setSaving] = useState(false);

  const openEdit = (plan: AdminPlan) => {
    setEditingPlan(plan);
    setForm({
      price_vnd: plan.price_vnd,
      max_projects: plan.max_projects,
      max_exports_per_month: plan.max_exports_per_month,
      allowed_export_formats: plan.allowed_export_formats,
      bake_priority: plan.bake_priority,
      polar_product_id: plan.polar_product_id,
      is_active: plan.is_active,
    });
  };

  const toggleFormat = (format: ExportFormat) => {
    setForm(prev => {
      const current = prev.allowed_export_formats ?? [];
      const next = current.includes(format) ? current.filter(f => f !== format) : [...current, format];
      return { ...prev, allowed_export_formats: next };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan || saving) return;
    setSaving(true);
    try {
      await adminPlans.update(editingPlan.id, form);
      toast(`Đã cập nhật gói ${editingPlan.tier} (${editingPlan.billing_cycle})`);
      setEditingPlan(null);
      reload();
    } catch (err) {
      if (err instanceof AdminApiError) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Quản lý gói dịch vụ</h1>
          <p className={shared.pageSubtitle}>Cấu hình giới hạn, định dạng export, và độ ưu tiên bake cho từng gói.</p>
        </div>
        {!isAdmin && (
          <span className={shared.forbiddenNote}><ShieldAlert size={14} /> Staff chỉ có quyền xem</span>
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
                <th>Tier</th>
                <th>Chu kỳ</th>
                <th>Giá</th>
                <th>Max Projects</th>
                <th>Max Export/Tháng</th>
                <th>Định dạng</th>
                <th>Ưu tiên Bake</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id}>
                  <td style={{ textTransform: 'capitalize' }}>{p.tier}</td>
                  <td className={shared.mutedCell}>{p.billing_cycle}</td>
                  <td>{p.price_vnd.toLocaleString('vi-VN')} VNĐ</td>
                  <td>{p.max_projects}</td>
                  <td>{p.max_exports_per_month}</td>
                  <td className={shared.mutedCell}>{p.allowed_export_formats.join(', ')}</td>
                  <td><StatusBadge status={p.bake_priority} tone={p.bake_priority === 'high' ? 'ok' : p.bake_priority === 'low' ? 'muted' : 'info'} /></td>
                  <td><StatusBadge status={p.is_active ? 'active' : 'inactive'} tone={p.is_active ? 'ok' : 'muted'} /></td>
                  <td>
                    <button
                      className={shared.iconBtn}
                      title={isAdmin ? 'Chỉnh sửa gói' : 'Chỉ Admin mới được chỉnh sửa'}
                      disabled={!isAdmin}
                      onClick={() => openEdit(p)}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {loading && plans.length === 0 && (
                <tr><td colSpan={9}><div className={shared.emptyState}>Đang tải...</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root open={editingPlan !== null} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={shared.dialogOverlay} />
          <Dialog.Content className={shared.dialogContent}>
            <Dialog.Title className={shared.dialogTitle}>
              Chỉnh sửa gói {editingPlan?.tier} ({editingPlan?.billing_cycle})
            </Dialog.Title>
            <Dialog.Description className={shared.dialogDescription}>
              Tier và chu kỳ thanh toán không thể thay đổi.
            </Dialog.Description>
            <form onSubmit={handleSave}>
              <div className={shared.formGrid}>
                <div className={shared.inputGroup}>
                  <label>Giá (VNĐ)</label>
                  <input
                    className={shared.input}
                    type="number"
                    min={0}
                    value={form.price_vnd ?? 0}
                    onChange={(e) => setForm({ ...form, price_vnd: Number(e.target.value) })}
                  />
                </div>
                <div className={shared.inputGroup}>
                  <label>Ưu tiên Bake</label>
                  <Select
                    value={form.bake_priority ?? 'normal'}
                    onValueChange={(v) => setForm({ ...form, bake_priority: v as BakePriority })}
                    options={PRIORITY_OPTIONS}
                  />
                </div>
                <div className={shared.inputGroup}>
                  <label>Max Projects</label>
                  <input
                    className={shared.input}
                    type="number"
                    min={0}
                    value={form.max_projects ?? 0}
                    onChange={(e) => setForm({ ...form, max_projects: Number(e.target.value) })}
                  />
                </div>
                <div className={shared.inputGroup}>
                  <label>Max Export/Tháng</label>
                  <input
                    className={shared.input}
                    type="number"
                    min={0}
                    value={form.max_exports_per_month ?? 0}
                    onChange={(e) => setForm({ ...form, max_exports_per_month: Number(e.target.value) })}
                  />
                </div>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label>Định dạng export cho phép</label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {FORMAT_OPTIONS.map(fmt => (
                      <label key={fmt} className={shared.checkRow}>
                        <input
                          type="checkbox"
                          checked={(form.allowed_export_formats ?? []).includes(fmt)}
                          onChange={() => toggleFormat(fmt)}
                        />
                        {fmt.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label>Polar Product ID</label>
                  <input
                    className={shared.input}
                    value={form.polar_product_id ?? ''}
                    onChange={(e) => setForm({ ...form, polar_product_id: e.target.value })}
                  />
                  <span className={shared.formHint}>Phải là giá trị duy nhất trên toàn hệ thống.</span>
                </div>
                <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
                  <label className={shared.checkRow}>
                    <input
                      type="checkbox"
                      checked={form.is_active ?? true}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Gói đang hoạt động (is_active)
                  </label>
                </div>
              </div>
              <div className={shared.dialogActions}>
                <Dialog.Close asChild>
                  <button type="button" className="btn-outline">Hủy</button>
                </Dialog.Close>
                <button type="submit" className="btn-neon-orange" disabled={saving}>Lưu thay đổi</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
