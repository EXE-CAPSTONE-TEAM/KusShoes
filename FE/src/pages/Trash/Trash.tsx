import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject, type TrashedProject } from '../../api/client';
import styles from './Trash.module.css';

interface TrashProps {
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
}

function formatDate(value: string, unknown: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknown;
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
  const { t } = useTranslation('projects');
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
        if (!cancelled) toast(caught instanceof Error ? caught.message : t('page.loadFailed'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const restored = await api.restoreProject(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setProjects((prev) => [restored, ...prev.filter((p) => p.id !== restored.id)]);
      toast(t('page.restored'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('page.restoreFailed'), 'error');
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
      toast(t('page.permDeleted'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('page.deleteFailed'), 'error');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('page.title')}</h1>
          <p className={styles.subtitle}>{t('page.subtitle')}</p>
        </div>
      </div>

      {loading ? (
        <p className={styles.loadingText}>{t('page.loading')}</p>
      ) : items.length === 0 ? (
        <motion.div
          className={`${styles.emptyState} glass-panel`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.emptyIconRing}>
            <Trash2 size={30} />
          </div>
          <h2 className={styles.emptyTitle}>{t('page.emptyTitle')}</h2>
          <p className={styles.emptyText}>
            {t('page.emptyText')}
          </p>
        </motion.div>
      ) : (
        <div className={`${styles.tableContainer} glass-panel`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('page.colName')}</th>
                <th>{t('page.colDeleted')}</th>
                <th>{t('page.colPurge')}</th>
                <th>{t('page.colActions')}</th>
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
                      <td data-label={t('page.colDeleted')}>{formatDate(item.deletedAt, t('page.unknown'))}</td>
                      <td data-label={t('page.colPurge')}>
                        <span
                          className={`${styles.daysLeftBadge} ${daysLeft <= 7 ? styles.daysLeftUrgent : styles.daysLeftNormal}`}
                        >
                          <Clock size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                          {daysLeft === 0 ? t('page.purgingSoon') : t('page.daysLeft', { count: daysLeft })}
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
                            {t('page.restore')}
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => setConfirmPermanentId(item.id)}
                          >
                            <Trash2 size={14} />
                            {t('page.deleteForever')}
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
        title={t('page.confirmTitle')}
        description={t('page.confirmDesc')}
        cancelLabel={t('page.cancel')}
        confirmLabel={t('page.deleteForever')}
        onConfirm={confirmPermanentDelete}
      />
    </div>
  );
};
