import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, type PortalProject, type TrashedProject } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './ProjectTrashPanel.module.css';

interface ProjectTrashPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful restore so the caller can prepend it back into the main list. */
  onRestored: (project: PortalProject) => void;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** BR-47: projects `deleteProject()` moved to trash, restorable here for 30 days before purge. */
export const ProjectTrashPanel: React.FC<ProjectTrashPanelProps> = ({
  open,
  onOpenChange,
  onRestored,
}) => {
  const { t } = useTranslation('projects');
  const { toast } = useToast();
  const [items, setItems] = useState<TrashedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  const load = async (cursor?: string | null) => {
    setLoading(true);
    try {
      const page = await api.listTrash(cursor);
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNextCursor(page.hasNext ? page.nextCursor : null);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('panel.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // Re-fetch fresh every time the panel opens; deliberately not depending on `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRestore = async (project: TrashedProject) => {
    setBusyId(project.id);
    try {
      const restored = await api.restoreProject(project.id);
      setItems((prev) => prev.filter((p) => p.id !== project.id));
      onRestored(restored);
      toast(t('panel.restoredNamed', { name: restored.name }));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('panel.restoreFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!confirmPurgeId) return;
    const id = confirmPurgeId;
    setConfirmPurgeId(null);
    setBusyId(id);
    try {
      await api.permanentlyDeleteProject(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast(t('panel.permDeleted'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('panel.deleteFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const purgeTarget = items.find((p) => p.id === confirmPurgeId) ?? null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.content}>
            <Dialog.Close className={styles.closeIcon} aria-label={t('panel.close')}>
              <X size={18} />
            </Dialog.Close>
            <Dialog.Title className={styles.title}>{t('panel.title')}</Dialog.Title>
            <Dialog.Description className={styles.description}>
              {t('panel.desc')}
            </Dialog.Description>

            {loading && items.length === 0 ? (
              <LoadingDots center label={t('panel.loading')} />
            ) : items.length === 0 ? (
              <p className={styles.muted}>{t('panel.empty')}</p>
            ) : (
              <ul className={styles.list}>
                {items.map((project) => (
                  <li key={project.id} className={styles.row}>
                    <img src={project.imageUrl} alt="" className={styles.thumb} />
                    <div className={styles.rowInfo}>
                      <span className={styles.rowName}>{project.name}</span>
                      <span className={styles.rowMeta}>
                        {daysUntil(project.purgeAt) <= 0
                          ? t('panel.purgingSoon')
                          : t('panel.daysLeft', { count: daysUntil(project.purgeAt) })}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.restoreBtn}
                        disabled={busyId === project.id}
                        onClick={() => void handleRestore(project)}
                        title={t('panel.restore')}
                      >
                        <RotateCcw size={15} />
                        {t('panel.restore')}
                      </button>
                      <button
                        type="button"
                        className={styles.purgeBtn}
                        disabled={busyId === project.id}
                        onClick={() => setConfirmPurgeId(project.id)}
                        title={t('panel.deleteForever')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {nextCursor && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => void load(nextCursor)}
                disabled={loading}
              >
                {loading ? t('panel.loadingShort') : t('panel.loadMore')}
              </button>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirmPurgeId !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmPurgeId(null);
        }}
        title={t('panel.confirmTitle')}
        description={t('panel.confirmDesc', { name: purgeTarget?.name ?? '' })}
        cancelLabel={t('panel.cancel')}
        confirmLabel={t('panel.deleteForever')}
        onConfirm={() => void handlePurge()}
      />
    </>
  );
};
