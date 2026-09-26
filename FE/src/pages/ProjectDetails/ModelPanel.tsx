import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Trash2, UploadCloud } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import { studioApi, type ProjectAsset } from '../../api/studio';
import styles from './ProjectPanels.module.css';

interface ModelPanelProps {
  projectId: string;
  canonicalModelAssetId: string | null;
  locked: boolean;
  /** Called after an import or a delete that may have changed the project's canonical model. */
  onModelChange: () => void | Promise<void>;
}

// Mirrors BE/app/services/asset_service.py: ALLOWED_UPLOADS["source_model"].
const SOURCE_MODEL_CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

function inferSourceModelContentType(filename: string): string | null {
  const match = /\.[^.]+$/.exec(filename.toLowerCase());
  return match ? SOURCE_MODEL_CONTENT_TYPES[match[0]] ?? null : null;
}

function formatAssetSize(bytes: number | null): string {
  if (bytes === null) return 'Size pending';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Import the source 3D model from the web (C3): the desktop-only upload-url/PUT/confirm flow. */
export const ModelPanel: React.FC<ModelPanelProps> = ({ projectId, canonicalModelAssetId, locked, onModelChange }) => {
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
      const message = caught instanceof Error ? caught.message : 'Unable to load assets.';
      toast(message, 'error');
      setLoadError(message);
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const importModel = async (file: File) => {
    if (locked) return;
    const contentType = inferSourceModelContentType(file.name);
    if (!contentType) {
      toast('Only .glb and .gltf files are supported for the 3D model.', 'error');
      return;
    }

    setUploadStep('Requesting an upload URL...');
    let upload;
    try {
      upload = await studioApi.createAssetUploadUrl(projectId, {
        asset_type: 'source_model',
        filename: file.name,
        content_type: contentType,
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to request an upload URL.', 'error');
      setUploadStep(null);
      return;
    }

    setUploadStep('Uploading the file...');
    try {
      await studioApi.putAssetFile(upload.upload_url, file, contentType);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to upload the file.', 'error');
      setUploadStep(null);
      return;
    }

    setUploadStep('Confirming the upload...');
    try {
      await studioApi.confirmAssetUpload(projectId, { asset_id: upload.asset_id, file_size_bytes: file.size });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to confirm the upload.', 'error');
      setUploadStep(null);
      return;
    }

    toast('3D model imported.');
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
      toast('Asset deleted.');
      await load();
      await onModelChange();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to delete this asset.', 'error');
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const uploading = uploadStep !== null;

  return (
    <div className={styles.stack}>
      {locked && (
        <div className={styles.lockedBanner}>
          This project is read-only after a plan downgrade, so the 3D model cannot be imported or deleted.
        </div>
      )}

      <div className={`${styles.panel} glass-panel`}>
        <div className={styles.panelHeader}>
          <Box size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>Model 3D</h4>
            <p className={styles.panelDesc}>
              Import the base shoe model (.glb or .gltf) from the web. The most recently imported model becomes
              this project's canonical model.
            </p>
          </div>
          <button
            type="button"
            className={`btn-neon-orange ${styles.headerAction}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || locked}
          >
            <UploadCloud size={16} /> {uploading ? 'Importing…' : 'Import model'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
            aria-label="Import 3D model file"
          />
        </div>

        {uploadStep && (
          <div className={styles.notice} role="status" aria-live="polite">
            <span>{uploadStep}</span>
          </div>
        )}

        {loadError ? (
          <div className={styles.notice} role="alert">
            <span>{loadError}</span>
            <button type="button" className="btn-outline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : assets === null ? (
          <p className={styles.muted}>Loading assets…</p>
        ) : assets.length === 0 ? (
          <p className={styles.muted}>No assets yet. Import a 3D model to get started.</p>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {asset.original_filename ?? asset.file_path.split('/').pop()}
                  {asset.id === canonicalModelAssetId && (
                    <span className={`${styles.chip} ${styles.chipOk}`}>Canonical model</span>
                  )}
                  <span className={styles.chip}>{asset.asset_type}</span>
                </span>
                <span className={styles.rowMeta}>
                  {asset.status} · {formatAssetSize(asset.file_size_bytes)} · {formatDateTime(asset.created_at)}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy || locked}
                  onClick={() => setDeleteTarget(asset)}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.original_filename ?? 'this asset'}"?`}
        description="This removes the file from storage. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void deleteAsset()}
      />
    </div>
  );
};
