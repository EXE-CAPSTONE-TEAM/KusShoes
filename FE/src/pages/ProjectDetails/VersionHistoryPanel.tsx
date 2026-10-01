import React, { useCallback, useEffect, useState } from 'react';
import { History, LayoutTemplate, Pin, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { studioApi, type DesignTemplate, type DesignVersion } from '../../api/studio';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { ReportContentLink } from '../../components/ReportContentLink/ReportContentLink';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './ProjectPanels.module.css';

interface VersionHistoryPanelProps {
  projectId: string;
  locked: boolean;
}

/** Design version history (BR-46) and the template gallery, both of which rewrite the current design. */
export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({ projectId, locked }) => {
  const { t } = useTranslation('details');
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
      toast(caught instanceof Error ? caught.message : t('history.loadError'), 'error');
    }
  }, [projectId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const restored = await studioApi.restoreVersion(projectId, restoreTarget.id);
      toast(t('history.restored', { from: restoreTarget.version_no, to: restored.version_no }));
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('history.restoreError'), 'error');
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
      toast(t('history.applied', { name: templateTarget.name }));
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('history.applyError'), 'error');
    } finally {
      setBusy(false);
      setTemplateTarget(null);
    }
  };

  return (
    <div className={styles.stack}>
      {locked && (
        <div className={`${styles.notice} ${styles.noticeWarning}`}>
          {t('history.locked')}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <History size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>{t('history.title')}</h4>
            <p className={styles.panelDesc}>
              {t('history.desc')}
            </p>
          </div>
        </div>
        {versions === null ? (
          <LoadingDots center label={t('history.loadingVersions')} />
        ) : versions.length === 0 ? (
          <p className={styles.muted}>
            {t('history.noVersions')}
          </p>
        ) : (
          versions.map((version, index) => (
            <div key={version.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {t('history.version', { n: version.version_no })}
                  {index === 0 && <span className={styles.chip}>{t('history.current')}</span>}
                  {version.is_pinned && (
                    <span className={styles.chip}>
                      <Pin size={10} /> {t('history.exported')}
                    </span>
                  )}
                </span>
                <span className={styles.rowMeta}>{formatDateTime(version.created_at)}</span>
              </div>
              {index > 0 && (
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.btnSm}`}
                  disabled={locked || busy}
                  onClick={() => setRestoreTarget(version)}
                >
                  <RotateCcw size={14} /> {t('history.restore')}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <LayoutTemplate size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>{t('history.tplTitle')}</h4>
            <p className={styles.panelDesc}>
              {t('history.tplDesc')}
            </p>
          </div>
        </div>
        {templates === null ? (
          <LoadingDots center label={t('history.loadingTemplates')} />
        ) : templates.length === 0 ? (
          <p className={styles.muted}>{t('history.noTemplates')}</p>
        ) : (
          <div className={styles.templateGrid}>
            {templates.map((template) => (
              <div key={template.id} className={styles.templateCard}>
                <span className={styles.templateName}>{template.name}</span>
                <span className={styles.templateMeta}>
                  {[
                    template.category,
                    t('history.layers', { n: template.layer_count }),
                    t('history.uses', { n: template.use_count }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {template.description && (
                  <span className={styles.templateMeta}>{template.description}</span>
                )}
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.btnSm}`}
                  disabled={locked || busy}
                  onClick={() => setTemplateTarget(template)}
                >
                  {t('history.useTemplate')}
                </button>
                <ReportContentLink
                  target={{ templateId: template.id }}
                  contextLabel={`"${template.name}"`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title={t('history.restoreTitle', { n: restoreTarget?.version_no ?? '' })}
        description={t('history.restoreDesc')}
        confirmLabel={t('history.restore')}
        danger={false}
        onConfirm={() => void restore()}
      />
      <ConfirmDialog
        open={templateTarget !== null}
        onOpenChange={(open) => !open && setTemplateTarget(null)}
        title={t('history.applyTitle', { name: templateTarget?.name ?? '' })}
        description={t('history.applyDesc')}
        confirmLabel={t('history.applyLabel')}
        danger={false}
        onConfirm={() => void applyTemplate()}
      />
    </div>
  );
};
