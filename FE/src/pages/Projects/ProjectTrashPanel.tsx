import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { api, type PortalProject, type TrashedProject } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
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
      toast(caught instanceof Error ? caught.message : 'Unable to load trash.', 'error');
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
      toast(`"${restored.name}" restored.`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to restore project.', 'error');
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
      toast('Project permanently deleted.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to delete project.', 'error');
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
            <Dialog.Close className={styles.closeIcon} aria-label="Close">
              <X size={18} />
            </Dialog.Close>
            <Dialog.Title className={styles.title}>Trash</Dialog.Title>
            <Dialog.Description className={styles.description}>
              Deleted projects stay here for 30 days before they&apos;re permanently removed.
            </Dialog.Description>

            {loading && items.length === 0 ? (
              <p className={styles.muted}>Loading…</p>
            ) : items.length === 0 ? (
              <p className={styles.muted}>Trash is empty.</p>
            ) : (
              <ul className={styles.list}>
                {items.map((project) => (
                  <li key={project.id} className={styles.row}>
                    <img src={project.imageUrl} alt="" className={styles.thumb} />
                    <div className={styles.rowInfo}>
                      <span className={styles.rowName}>{project.name}</span>
                      <span className={styles.rowMeta}>
                        {daysUntil(project.purgeAt) <= 0
                          ? 'Purging soon'
                          : `${daysUntil(project.purgeAt)} day${daysUntil(project.purgeAt) === 1 ? '' : 's'} left to restore`}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.restoreBtn}
                        disabled={busyId === project.id}
                        onClick={() => void handleRestore(project)}
                        title="Restore"
                      >
                        <RotateCcw size={15} />
                        Restore
                      </button>
                      <button
                        type="button"
                        className={styles.purgeBtn}
                        disabled={busyId === project.id}
                        onClick={() => setConfirmPurgeId(project.id)}
                        title="Delete forever"
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
                className="btn-outline"
                onClick={() => void load(nextCursor)}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Load more'}
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
        title="Delete permanently?"
        description={`"${purgeTarget?.name ?? ''}" and its scanned assets will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete forever"
        onConfirm={() => void handlePurge()}
      />
    </>
  );
};
