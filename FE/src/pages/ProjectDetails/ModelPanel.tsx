import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import { studioApi, type ProjectAsset } from '../../api/studio';
import {
  SOURCE_MODEL_ACCEPT,
  importSourceModel,
  inferSourceModelContentType,
  type SourceModelImportStep,
} from '../../api/sourceModel';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './ProjectPanels.module.css';

interface ModelPanelProps {
  projectId: string;
  canonicalModelAssetId: string | null;
  locked: boolean;
  /** Called after an import or a delete that may have changed the project's canonical model. */
  onModelChange: () => void | Promise<void>;
}

const IMPORT_STEP_KEYS: Record<SourceModelImportStep, string> = {
  requesting: 'model.stepRequesting',
  uploading: 'model.stepUploading',
  confirming: 'model.stepConfirming',
};

function formatAssetSize(bytes: number | null, pendingLabel: string): string {
  if (bytes === null) return pendingLabel;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Import the source 3D model from the web (C3): the desktop-only upload-url/PUT/confirm flow. */
export const ModelPanel: React.FC<ModelPanelProps> = ({ projectId, canonicalModelAssetId, locked, onModelChange }) => {
  const { t } = useTranslation('details');
  const { toast } = useToast();
  const [assets, setAssets] = useState<ProjectAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setAssets(await studioApi.listAssets(projectId));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('model.loadError');
      toast(message, 'error');
      setLoadError(message);
    }
  }, [projectId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const importModel = async (file: File) => {
    if (locked) return;
    if (!inferSourceModelContentType(file.name)) {
      toast(t('model.onlyGlb'), 'error');
      return;
    }

    try {
      await importSourceModel(projectId, file, (step) => setUploadStep(t(IMPORT_STEP_KEYS[step])));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('model.importError'), 'error');
      setUploadStep(null);
      return;
    }

    toast(t('model.imported'));
    setUploadStep(null);
    await load();
    await onModelChange();
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (file) void importModel(file);
  };

  const deleteAsset = async () => {
    if (!deleteTarget || locked) return;
    setBusy(true);
    try {
      await studioApi.deleteAsset(projectId, deleteTarget.id);
      toast(t('model.deleted'));
      await load();
      await onModelChange();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('model.deleteError'), 'error');
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const uploading = uploadStep !== null;

  return (
    <div className={styles.stack}>
      {locked && (
        <div className={`${styles.notice} ${styles.noticeWarning}`}>
          {t('model.locked')}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <Box size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>{t('model.title')}</h4>
            <p className={styles.panelDesc}>
              {t('model.desc')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.btnPrimary} ${styles.headerAction}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || locked}
          >
            <UploadCloud size={16} /> {uploading ? t('model.importing') : t('model.import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={SOURCE_MODEL_ACCEPT}
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
            aria-label={t('model.inputLabel')}
          />
        </div>

        {uploadStep && (
          <div className={styles.notice} role="status" aria-live="polite">
            <span>{uploadStep}</span>
          </div>
        )}

        {loadError ? (
          <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
            <span>{loadError}</span>
            <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
              {t('model.retry')}
            </button>
          </div>
        ) : assets === null ? (
          <LoadingDots center label={t('model.loading')} />
        ) : assets.length === 0 ? (
          <p className={styles.muted}>{t('model.empty')}</p>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {asset.original_filename ?? asset.file_path.split('/').pop()}
                  {asset.id === canonicalModelAssetId && (
                    <span className={styles.chip}>{t('model.canonical')}</span>
                  )}
                  <span className={styles.chip}>{asset.asset_type}</span>
                </span>
                <span className={styles.rowMeta}>
                  {asset.status} · {formatAssetSize(asset.file_size_bytes, t('model.sizePending'))} · {formatDateTime(asset.created_at)}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.btnSm}`}
                  disabled={busy || locked}
                  onClick={() => setDeleteTarget(asset)}
                >
                  <Trash2 size={14} /> {t('model.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('model.confirmTitle', { name: deleteTarget?.original_filename ?? t('model.thisAsset') })}
        description={t('model.confirmDesc')}
        confirmLabel={t('model.delete')}
        onConfirm={() => void deleteAsset()}
      />
    </div>
  );
};
