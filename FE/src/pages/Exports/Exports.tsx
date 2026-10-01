import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FileBox } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Select } from '../../components/Select/Select';
import { useToast } from '../../context/ToastContext';
import { api, type ExportFormat, type ExportHistoryItem } from '../../api/client';
import { formatDateTime } from '../../utils/format';
// Same table layout as the Trash page.
import styles from '../Trash/Trash.module.css';

interface ExportsProps {
  onOpenProject: (projectId: string) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Every 3D export of the account (GET /api/v1/exports), across projects. */
export const Exports: React.FC<ExportsProps> = ({ onOpenProject }) => {
  const { t } = useTranslation('details');
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [items, setItems] = useState<ExportHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const formatOptions = [
    { value: 'all', label: t('exports.all') },
    { value: 'glb', label: 'GLB' },
    { value: 'obj', label: 'OBJ' },
    { value: 'zip', label: 'ZIP' },
  ];

  const load = useCallback(
    async (cursor: string | null) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await api.listExportHistory({ cursor, format });
        setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setNextCursor(page.hasNext ? page.nextCursor : null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('exports.loadError'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [format, t],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const handleDownload = async (item: ExportHistoryItem) => {
    setDownloadingId(item.id);
    try {
      window.location.assign(await api.createExportDownloadUrl(item.id));
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, download_count: row.download_count + 1 } : row)),
      );
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('exports.downloadError'), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('exports.title')}</h1>
          <p className={styles.subtitle}>{t('exports.subtitle')}</p>
        </div>
        <Select
          value={format ?? 'all'}
          onValueChange={(value) => setFormat(value === 'all' ? null : (value as ExportFormat))}
          options={formatOptions}
          ariaLabel={t('exports.filter')}
        />
      </div>

      {loading ? (
        <p className={styles.loadingText}>{t('exports.loading')}</p>
      ) : error ? (
        <div role="alert" className={`${styles.emptyState} glass-panel`}>
          <p className={styles.emptyText}>{error}</p>
          <button className="btn-outline" onClick={() => void load(null)}>
            {t('exports.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <motion.div
          className={`${styles.emptyState} glass-panel`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.emptyIconRing}>
            <FileBox size={30} />
          </div>
          <h2 className={styles.emptyTitle}>{t('exports.emptyTitle')}</h2>
          <p className={styles.emptyText}>
            {format
              ? t('exports.emptyFormat', { format: format.toUpperCase() })
              : t('exports.emptyAll')}
          </p>
        </motion.div>
      ) : (
        <div className={`${styles.tableContainer} glass-panel`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('exports.colProject')}</th>
                <th>{t('exports.colFormat')}</th>
                <th>{t('exports.colSize')}</th>
                <th>{t('exports.colDownloads')}</th>
                <th>{t('exports.colExported')}</th>
                <th>{t('exports.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={styles.tableRow}>
                  <td>
                    <span className={styles.rowProjectName}>{item.project_name}</span>
                  </td>
                  <td data-label={t('exports.colFormat')}>
                    {item.format.toUpperCase()}
                    {item.is_watermarked && t('exports.watermarked')}
                  </td>
                  <td data-label={t('exports.colSize')}>{formatBytes(item.file_size_bytes)}</td>
                  <td data-label={t('exports.colDownloads')}>{item.download_count}</td>
                  <td data-label={t('exports.colExported')}>{formatDateTime(item.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => void handleDownload(item)}
                        disabled={downloadingId === item.id}
                      >
                        <Download size={14} />
                        {t('exports.download')}
                      </button>
                      <button className={styles.actionBtn} onClick={() => onOpenProject(item.project_id)}>
                        <ExternalLink size={14} />
                        {t('exports.project')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && nextCursor && (
        <div style={{ textAlign: 'center' }}>
          <button className="btn-outline" onClick={() => void load(nextCursor)} disabled={loadingMore}>
            {loadingMore ? t('exports.loadingMore') : t('exports.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
};
