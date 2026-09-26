import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject, type TrashedProject } from '../../api/client';
import styles from './Trash.module.css';

interface TrashProps {
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Days remaining until purgeAt, floored at 0 for anything already due. */
function daysUntil(value: string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  const diffMs = timestamp - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export const Trash: React.FC<TrashProps> = ({ setProjects }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<TrashedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPermanentId, setConfirmPermanentId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const allItems: TrashedProject[] = [];
        let cursor: string | null = null;
        do {
          const page = await api.listTrash(cursor);
          allItems.push(...page.items);
          cursor = page.hasNext ? page.nextCursor : null;
        } while (cursor && !cancelled);
        if (!cancelled) setItems(allItems);
      } catch (caught) {
        if (!cancelled) toast(caught instanceof Error ? caught.message : 'Unable to load trash.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const restored = await api.restoreProject(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setProjects((prev) => [restored, ...prev.filter((p) => p.id !== restored.id)]);
      toast('Project restored.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to restore project.', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!confirmPermanentId) return;
    const id = confirmPermanentId;
    try {
      await api.permanentlyDeleteProject(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setConfirmPermanentId(null);
      toast('Project permanently deleted.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to delete project.', 'error');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Trash</h1>
          <p className={styles.subtitle}>Deleted projects are kept for 30 days before being permanently removed.</p>
        </div>
      </div>

      {loading ? (
        <p className={styles.loadingText}>Loading trash…</p>
      ) : items.length === 0 ? (
        <motion.div
          className={`${styles.emptyState} glass-panel`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.emptyIconRing}>
            <Trash2 size={30} />
          </div>
          <h2 className={styles.emptyTitle}>Trash is empty</h2>
          <p className={styles.emptyText}>
            Deleted projects show up here for 30 days before they&apos;re permanently removed.
          </p>
        </motion.div>
      ) : (
        <div className={`${styles.tableContainer} glass-panel`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Deleted On</th>
                <th>Purge Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {items.map((item) => {
                  const daysLeft = daysUntil(item.purgeAt);
                  return (
                    <motion.tr
                      key={item.id}
                      className={styles.tableRow}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <td>
                        <div className={styles.projectNameCol}>
                          <img src={item.imageUrl} alt="" className={styles.rowThumbnail} />
                          <span className={styles.rowProjectName}>{item.name}</span>
                        </div>
                      </td>
                      <td>{formatDate(item.deletedAt)}</td>
                      <td>
                        <span
                          className={`${styles.daysLeftBadge} ${daysLeft <= 7 ? styles.daysLeftUrgent : styles.daysLeftNormal}`}
                        >
                          <Clock size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                          {daysLeft === 0 ? 'Purging soon' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            className={styles.actionBtn}
                            onClick={() => handleRestore(item.id)}
                            disabled={restoringId === item.id}
                          >
                            <RotateCcw size={14} />
                            Restore
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => setConfirmPermanentId(item.id)}
                          >
                            <Trash2 size={14} />
                            Delete Forever
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmPermanentId !== null}
        onOpenChange={(open) => !open && setConfirmPermanentId(null)}
        title="Permanently delete this project?"
        description="This will permanently remove the project and its scanned assets. This action cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={confirmPermanentDelete}
      />
    </div>
  );
};
