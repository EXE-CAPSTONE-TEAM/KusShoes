import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { adminStudio, AdminApiError } from '../../../api/adminClient';
import type { AdminTemplate, GuardrailRule } from '../../../types/admin';
import { AdminDialog } from '../../../components/Admin/AdminDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog';
import { Select } from '../../../components/Select/Select';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useToast } from '../../../context/ToastContext';
import shared from '../admin-shared.module.css';

const KIND_OPTIONS = [
  { value: 'trademark', label: 'Thương hiệu (cần xác nhận bản quyền)' },
  { value: 'banned', label: 'Từ cấm (chặn lưu)' },
];

const TEMPLATE_FILTERS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Đã từ chối' },
];

const TEMPLATE_TONE: Record<string, 'warn' | 'ok' | 'danger'> = { pending: 'warn', approved: 'ok', rejected: 'danger' };
const TEMPLATE_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };

const SAMPLE_CONFIG = '{\n  "baseColor": "#ffffff",\n  "stickers": [],\n  "texts": []\n}';

const errorText = (caught: unknown, fallback: string) => (caught instanceof AdminApiError || caught instanceof Error ? caught.message : fallback);

export const AdminContent: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();
  const [busy, setBusy] = useState(false);

  // ---- Guardrail rules (BR-54) ----
  const [rules, setRules] = useState<GuardrailRule[] | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleKind, setRuleKind] = useState<'banned' | 'trademark'>('trademark');
  const [ruleTerm, setRuleTerm] = useState('');
  const [deleteRule, setDeleteRule] = useState<GuardrailRule | null>(null);

  // ---- Templates ----
  const [templates, setTemplates] = useState<AdminTemplate[] | null>(null);
  const [templateFilter, setTemplateFilter] = useState('all');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('');
  const [tplDescription, setTplDescription] = useState('');
  const [tplConfig, setTplConfig] = useState(SAMPLE_CONFIG);

  const loadRules = useCallback(async () => {
    try {
      setRules(await adminStudio.listRules());
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải quy tắc.'), 'error');
    }
  }, [toast]);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await adminStudio.listTemplates(templateFilter === 'all' ? undefined : templateFilter));
    } catch (caught) {
      toast(errorText(caught, 'Không thể tải template.'), 'error');
    }
  }, [templateFilter, toast]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast(errorText(caught, failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addRule = () =>
    run(async () => {
      await adminStudio.createRule(ruleKind, ruleTerm.trim());
      toast('Đã thêm quy tắc.');
      setRuleOpen(false);
      setRuleTerm('');
      await loadRules();
    }, 'Không thể thêm quy tắc.');

  const createTemplate = () =>
    run(async () => {
      let config: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(tplConfig);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
        config = parsed as Record<string, unknown>;
      } catch {
        toast('design_config phải là một đối tượng JSON hợp lệ.', 'error');
        return;
      }
      await adminStudio.createTemplate({
        name: tplName.trim(),
        category: tplCategory.trim() || null,
        description: tplDescription.trim() || null,
        design_config: config,
      });
      toast('Đã tạo template (chờ duyệt).');
      setTemplateOpen(false);
      setTplName('');
      setTplCategory('');
      setTplDescription('');
      setTplConfig(SAMPLE_CONFIG);
      await loadTemplates();
    }, 'Không thể tạo template.');

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Nội dung &amp; Studio</h1>
          <p className={shared.pageSubtitle}>Quy tắc kiểm soát nội dung thiết kế và thư viện template.</p>
        </div>
      </div>

      <Tabs.Root defaultValue="rules">
        <Tabs.List style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Tabs.Trigger value="rules" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>Quy tắc nội dung</Tabs.Trigger>
          <Tabs.Trigger value="templates" className="btn-outline" style={{ borderRadius: 'var(--border-radius-md)' }}>Template</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="rules">
          <div className={shared.toolbar} style={{ marginBottom: 16 }}>
            <span className={shared.pageSubtitle}>
              Chữ trên thiết kế tối đa 20 ký tự. Từ cấm chặn lưu; từ thương hiệu yêu cầu người dùng xác nhận bản quyền.
            </span>
            <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setRuleOpen(true)}>
              <Plus size={16} /> Thêm quy tắc
            </button>
          </div>
          <div className={`${shared.tableWrap} glass-panel`}>
            <table className={shared.table}>
              <thead><tr><th>Từ khóa</th><th>Loại</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
              <tbody>
                {(rules ?? []).map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.term}</td>
                    <td><StatusBadge status={rule.kind} tone={rule.kind === 'banned' ? 'danger' : 'warn'} label={rule.kind === 'banned' ? 'Từ cấm' : 'Thương hiệu'} /></td>
                    <td>
                      <label className={shared.switchLabel}>
                        <input
                          type="checkbox"
                          checked={rule.is_active}
                          disabled={!isAdmin || busy}
                          onChange={(event) =>
                            void run(async () => {
                              await adminStudio.setRuleActive(rule.id, event.target.checked);
                              await loadRules();
                            }, 'Không thể cập nhật quy tắc.')
                          }
                        />
                        {rule.is_active ? 'Đang áp dụng' : 'Tạm tắt'}
                      </label>
                    </td>
                    <td>
                      <button className={`${shared.iconBtn} ${shared.iconBtnDanger}`} disabled={!isAdmin || busy} title="Xóa" onClick={() => setDeleteRule(rule)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {rules !== null && rules.length === 0 && (
                  <tr><td colSpan={4}><div className={shared.emptyState}>Chưa có quy tắc.</div></td></tr>
                )}
                {rules === null && <tr><td colSpan={4}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Tabs.Content>

        <Tabs.Content value="templates">
          <div className={shared.toolbar} style={{ marginBottom: 16 }}>
            <Select value={templateFilter} onValueChange={setTemplateFilter} options={TEMPLATE_FILTERS} ariaLabel="Lọc template" />
            <button className="btn-neon-orange" disabled={!isAdmin} onClick={() => setTemplateOpen(true)}>
              <Plus size={16} /> Tạo template
            </button>
          </div>
          <div className={`${shared.tableWrap} glass-panel`}>
            <table className={shared.table}>
              <thead><tr><th>Tên</th><th>Danh mục</th><th>Layer</th><th>Lượt dùng</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
              <tbody>
                {(templates ?? []).map((template) => (
                  <tr key={template.id}>
                    <td>
                      {template.name}
                      {template.description && <div className={shared.subText}>{template.description}</div>}
                    </td>
                    <td className={shared.mutedCell}>{template.category ?? '—'}</td>
                    <td className={shared.mutedCell}>{template.layer_count}</td>
                    <td className={shared.mutedCell}>{template.use_count}</td>
                    <td><StatusBadge status={template.status} tone={TEMPLATE_TONE[template.status]} label={TEMPLATE_LABEL[template.status]} /></td>
                    <td>
                      <div className={shared.rowActions}>
                        <button
                          className={shared.iconBtn}
                          title="Duyệt"
                          disabled={!isAdmin || busy || template.status === 'approved'}
                          onClick={() => void run(async () => { await adminStudio.reviewTemplate(template.id, true); toast('Đã duyệt template.'); await loadTemplates(); }, 'Không thể duyệt.')}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className={`${shared.iconBtn} ${shared.iconBtnDanger}`}
                          title="Từ chối"
                          disabled={!isAdmin || busy || template.status === 'rejected'}
                          onClick={() => void run(async () => { await adminStudio.reviewTemplate(template.id, false); toast('Đã từ chối template.'); await loadTemplates(); }, 'Không thể từ chối.')}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {templates !== null && templates.length === 0 && (
                  <tr><td colSpan={6}><div className={shared.emptyState}>Không có template phù hợp.</div></td></tr>
                )}
                {templates === null && <tr><td colSpan={6}><div className={shared.emptyState}>Đang tải...</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <AdminDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        title="Thêm quy tắc nội dung"
        description="Từ khóa được chuẩn hóa (không dấu, chữ thường) và so khớp theo từ nguyên vẹn."
        submitLabel="Thêm"
        busy={busy}
        submitDisabled={ruleTerm.trim().length < 2}
        onSubmit={() => void addRule()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Loại</label>
          <Select value={ruleKind} onValueChange={(value) => setRuleKind(value as 'banned' | 'trademark')} options={KIND_OPTIONS} ariaLabel="Loại quy tắc" />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Từ khóa</label>
          <input className={shared.input} value={ruleTerm} maxLength={100} onChange={(event) => setRuleTerm(event.target.value)} />
        </div>
      </AdminDialog>

      <AdminDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title="Tạo template"
        description="Template mới ở trạng thái chờ duyệt. Nội dung chữ phải qua quy tắc kiểm soát."
        submitLabel="Tạo template"
        busy={busy}
        submitDisabled={!tplName.trim()}
        onSubmit={() => void createTemplate()}
      >
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>Tên</label>
          <input className={shared.input} value={tplName} maxLength={100} onChange={(event) => setTplName(event.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label>Danh mục</label>
          <input className={shared.input} value={tplCategory} maxLength={50} onChange={(event) => setTplCategory(event.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label>Mô tả</label>
          <input className={shared.input} value={tplDescription} maxLength={1000} onChange={(event) => setTplDescription(event.target.value)} />
        </div>
        <div className={`${shared.inputGroup} ${shared.formGridFull}`}>
          <label>design_config (JSON)</label>
          <textarea
            className={shared.input}
            style={{ minHeight: 160, fontFamily: 'var(--font-mono)' }}
            value={tplConfig}
            onChange={(event) => setTplConfig(event.target.value)}
          />
          <span className={shared.formHint}>Dán cấu hình xuất từ KusStudio (baseColor, stickers, texts…).</span>
        </div>
      </AdminDialog>

      <ConfirmDialog
        open={deleteRule !== null}
        onOpenChange={(open) => !open && setDeleteRule(null)}
        title={`Xóa quy tắc “${deleteRule?.term ?? ''}”?`}
        description="Thiết kế chứa từ này sẽ không còn bị chặn hoặc yêu cầu xác nhận. Thao tác được ghi vào nhật ký."
        confirmLabel="Xóa"
        onConfirm={() =>
          void run(async () => {
            if (deleteRule) await adminStudio.removeRule(deleteRule.id);
            toast('Đã xóa quy tắc.');
            setDeleteRule(null);
            await loadRules();
          }, 'Không thể xóa quy tắc.')
        }
      />
    </div>
  );
};
