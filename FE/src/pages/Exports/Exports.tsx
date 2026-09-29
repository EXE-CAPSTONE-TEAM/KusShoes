import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FileBox } from 'lucide-react';
import { motion } from 'framer-motion';
import { Select } from '../../components/Select/Select';
import { useToast } from '../../context/ToastContext';
import { api, type ExportFormat, type ExportHistoryItem } from '../../api/client';
import { formatDateTime } from '../../utils/format';
// Same table layout as the Trash page.
import styles from '../Trash/Trash.module.css';

interface ExportsProps {
  onOpenProject: (projectId: string) => void;
}

const FORMAT_OPTIONS = [
  { value: 'all', label: 'All formats' },
  { value: 'glb', label: 'GLB' },
  { value: 'obj', label: 'OBJ' },
  { value: 'zip', label: 'ZIP' },
];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Every 3D export of the account (GET /api/v1/exports), across projects. */
export const Exports: React.FC<ExportsProps> = ({ onOpenProject }) => {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [items, setItems] = useState<ExportHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
        setError(caught instanceof Error ? caught.message : 'Unable to load exports.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [format],
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
      toast(caught instanceof Error ? caught.message : 'Unable to create download URL.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Exports</h1>
          <p className={styles.subtitle}>Every 3D file exported from KusStudio, across all your projects.</p>
        </div>
        <Select
          value={format ?? 'all'}
          onValueChange={(value) => setFormat(value === 'all' ? null : (value as ExportFormat))}
          options={FORMAT_OPTIONS}
          ariaLabel="Filter by format"
        />
      </div>

      {loading ? (
        <p className={styles.loadingText}>Loading exports…</p>
      ) : error ? (
        <div role="alert" className={`${styles.emptyState} glass-panel`}>
          <p className={styles.emptyText}>{error}</p>
          <button className="btn-outline" onClick={() => void load(null)}>
            Retry
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
          <h2 className={styles.emptyTitle}>No exports yet</h2>
          <p className={styles.emptyText}>
            {format
              ? `No ${format.toUpperCase()} exports. Try another format.`
              : 'Export a design from KusStudio and the file shows up here.'}
          </p>
        </motion.div>
      ) : (
        <div className={`${styles.tableContainer} glass-panel`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Format</th>
                <th>Size</th>
                <th>Downloads</th>
                <th>Exported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={styles.tableRow}>
                  <td>
                    <span className={styles.rowProjectName}>{item.project_name}</span>
                  </td>
                  <td>
                    {item.format.toUpperCase()}
                    {item.is_watermarked && ' · watermarked'}
                  </td>
                  <td>{formatBytes(item.file_size_bytes)}</td>
                  <td>{item.download_count}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => void handleDownload(item)}
                        disabled={downloadingId === item.id}
                      >
                        <Download size={14} />
                        Download
                      </button>
                      <button className={styles.actionBtn} onClick={() => onOpenProject(item.project_id)}>
                        <ExternalLink size={14} />
                        Project
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
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};
