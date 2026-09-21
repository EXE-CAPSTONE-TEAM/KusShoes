import React, { useCallback, useEffect, useState } from 'react';
import { History, LayoutTemplate, Pin, RotateCcw } from 'lucide-react';
import { studioApi, type DesignTemplate, type DesignVersion } from '../../api/studio';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import styles from './ProjectPanels.module.css';

interface VersionHistoryPanelProps {
  projectId: string;
  locked: boolean;
}

/** Design version history (BR-46) and the template gallery, both of which rewrite the current design. */
export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({ projectId, locked }) => {
  const { toast } = useToast();
  const [versions, setVersions] = useState<DesignVersion[] | null>(null);
  const [templates, setTemplates] = useState<DesignTemplate[] | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DesignVersion | null>(null);
  const [templateTarget, setTemplateTarget] = useState<DesignTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextVersions, nextTemplates] = await Promise.all([
        studioApi.listVersions(projectId),
        studioApi.listTemplates(),
      ]);
      setVersions(nextVersions);
      setTemplates(nextTemplates);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to load design history.', 'error');
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const restored = await studioApi.restoreVersion(projectId, restoreTarget.id);
      toast(`Version ${restoreTarget.version_no} restored as version ${restored.version_no}.`);
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to restore that version.', 'error');
    } finally {
      setBusy(false);
      setRestoreTarget(null);
    }
  };

  const applyTemplate = async () => {
    if (!templateTarget) return;
    setBusy(true);
    try {
      await studioApi.applyTemplate(projectId, templateTarget.id);
      toast(`Template “${templateTarget.name}” applied. Open KusStudio to continue editing.`);
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to apply that template.', 'error');
    } finally {
      setBusy(false);
      setTemplateTarget(null);
    }
  };

  return (
    <div className={styles.stack}>
      {locked && (
        <div className={styles.lockedBanner}>
          This project is read-only after a plan downgrade, so versions cannot be restored and templates cannot be applied.
        </div>
      )}

      <div className={`${styles.panel} glass-panel`}>
        <div className={styles.panelHeader}>
          <History size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>Version history</h4>
            <p className={styles.panelDesc}>
              A version is saved each time the design changes. Versions sent to export are pinned and never removed.
            </p>
          </div>
        </div>
        {versions === null ? (
          <p className={styles.muted}>Loading versions…</p>
        ) : versions.length === 0 ? (
          <p className={styles.muted}>No saved versions yet. Save a design in KusStudio to start the history.</p>
        ) : (
          versions.map((version, index) => (
            <div key={version.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  Version {version.version_no}
                  {index === 0 && <span className={`${styles.chip} ${styles.chipOk}`}>Current</span>}
                  {version.is_pinned && (
                    <span className={`${styles.chip} ${styles.chipPin}`}>
                      <Pin size={10} /> Exported
                    </span>
                  )}
                </span>
                <span className={styles.rowMeta}>{formatDateTime(version.created_at)}</span>
              </div>
              {index > 0 && (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={locked || busy}
                  onClick={() => setRestoreTarget(version)}
                >
                  <RotateCcw size={14} /> Restore
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className={`${styles.panel} glass-panel`}>
        <div className={styles.panelHeader}>
          <LayoutTemplate size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>Start from a template</h4>
            <p className={styles.panelDesc}>Applying a template replaces the current design (the old one stays in the history).</p>
          </div>
        </div>
        {templates === null ? (
          <p className={styles.muted}>Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className={styles.muted}>No templates are published yet.</p>
        ) : (
          <div className={styles.templateGrid}>
            {templates.map((template) => (
              <div key={template.id} className={styles.templateCard}>
                <span className={styles.templateName}>{template.name}</span>
                <span className={styles.templateMeta}>
                  {[template.category, `${template.layer_count} layers`, `${template.use_count} uses`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {template.description && <span className={styles.templateMeta}>{template.description}</span>}
                <button
                  type="button"
                  className="btn-outline"
                  disabled={locked || busy}
                  onClick={() => setTemplateTarget(template)}
                >
                  Use template
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title={`Restore version ${restoreTarget?.version_no ?? ''}?`}
        description="The current design is replaced by this version. Nothing is lost: your current design stays in the history."
        confirmLabel="Restore"
        danger={false}
        onConfirm={() => void restore()}
      />
      <ConfirmDialog
        open={templateTarget !== null}
        onOpenChange={(open) => !open && setTemplateTarget(null)}
        title={`Apply “${templateTarget?.name ?? ''}”?`}
        description="The current design is replaced by the template. It stays available in the version history."
        confirmLabel="Apply template"
        danger={false}
        onConfirm={() => void applyTemplate()}
      />
    </div>
  );
};
