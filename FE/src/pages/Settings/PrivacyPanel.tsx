import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import {
  accountApi,
  type ConsentRecord,
  type ConsentType,
  type DataImportHistoryItem,
  type PrivacySettings,
} from '../../api/account';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { updateAnalyticsConsent } from '../../analytics';
import { formatDateTime } from '../../utils/format';
import styles from './Settings.module.css';
import panel from './AccountPanels.module.css';

const PRIVACY_KEYS: (keyof PrivacySettings)[] = [
  'is_profile_public',
  'show_designs_publicly',
  'is_searchable',
  'allow_analytics',
  'allow_ads_personalization',
];

const CONSENT_TYPES: ConsentType[] = ['marketing_content', 'academic_report', 'cookie_analytics'];

const Toggle: React.FC<{
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}> = ({ on, disabled, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    className={`${styles.toggleBtn} ${on ? styles.toggleActive : ''}`}
    onClick={() => onChange(!on)}
  >
    <div className={styles.toggleKnob} />
  </button>
);

export const PrivacyPanel: React.FC = () => {
  const { t } = useTranslation('account');
  const { toast } = useToast();
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [importHistory, setImportHistory] = useState<DataImportHistoryItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [settings, records] = await Promise.all([
        accountApi.getPrivacy(),
        accountApi.listConsents(),
      ]);
      setPrivacy(settings);
      setConsents(records);
      updateAnalyticsConsent({
        analytics: settings.allow_analytics,
        ads: settings.allow_ads_personalization,
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('privacy.loadError'), 'error');
    }
  }, [toast, t]);

  const loadImportHistory = useCallback(async () => {
    try {
      setImportHistory(await accountApi.listDataImports());
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('privacy.importHistoryError'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
    void loadImportHistory();
  }, [load, loadImportHistory]);

  const togglePrivacy = async (key: keyof PrivacySettings, next: boolean) => {
    if (!privacy) return;
    const previous = privacy;
    setPrivacy({ ...privacy, [key]: next }); // optimistic; rolled back if the server refuses
    if (key === 'allow_analytics' || key === 'allow_ads_personalization') {
      updateAnalyticsConsent({
        analytics: key === 'allow_analytics' ? next : privacy.allow_analytics,
        ads: key === 'allow_ads_personalization' ? next : privacy.allow_ads_personalization,
      });
    }
    try {
      await accountApi.updatePrivacy({ [key]: next });
    } catch (caught) {
      setPrivacy(previous);
      if (key === 'allow_analytics' || key === 'allow_ads_personalization') {
        updateAnalyticsConsent({
          analytics: previous.allow_analytics,
          ads: previous.allow_ads_personalization,
        });
      }
      toast(caught instanceof Error ? caught.message : t('privacy.saveError'), 'error');
    }
  };

  const isGranted = (type: ConsentType) =>
    Boolean(consents?.some((record) => record.type === type && record.revoked_at === null));

  const toggleConsent = async (type: ConsentType, granted: boolean) => {
    setBusy(true);
    if (type === 'cookie_analytics') {
      updateAnalyticsConsent({
        analytics: granted,
      });
    }
    try {
      await accountApi.recordConsent(type, granted);
      setConsents(await accountApi.listConsents());
    } catch (caught) {
      if (type === 'cookie_analytics') {
        updateAnalyticsConsent({
          analytics: !granted,
        });
      }
      toast(caught instanceof Error ? caught.message : t('privacy.consentError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const result = await accountApi.requestDataExport();
      window.open(result.download_url, '_blank', 'noopener');
      toast(t('privacy.exportReady'), 'info');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('privacy.exportError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file: File) => {
    setImporting(true);
    try {
      const upload = await accountApi.requestDataImportUpload();
      const putResponse = await fetch(upload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      });
      if (!putResponse.ok) throw new Error(t('privacy.uploadError'));
      const result = await accountApi.confirmDataImport(upload.import_id);
      if (result.status === 'completed') {
        toast(t('privacy.imported', { count: result.projects_imported }), 'info');
      } else {
        toast(result.message || t('privacy.importRejected'), 'error');
      }
      await loadImportHistory();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('privacy.restoreError'), 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await accountApi.deleteAccount(deletePassword);
      toast(t('privacy.deleted'), 'info');
      await api.logout();
      window.setTimeout(() => window.location.assign('/'), 1200);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('privacy.deleteError'), 'error');
      setBusy(false);
    } finally {
      setDeletePassword('');
    }
  };

  return (
    <div className={panel.grid2}>
      <div className={panel.panel}>
        <div>
          <h4 className={panel.panelTitle}>{t('privacy.visibilityTitle')}</h4>
          <p className={panel.panelDesc}>{t('privacy.visibilityDesc')}</p>
        </div>
        {PRIVACY_KEYS.map((key) => (
          <div key={key} className={styles.toggleRow}>
            <div>
              <h4 className={styles.toggleLabel}>{t(`privacy.${key}_title`)}</h4>
              <p className={styles.toggleDesc}>{t(`privacy.${key}_desc`)}</p>
            </div>
            <Toggle
              on={Boolean(privacy?.[key])}
              disabled={!privacy}
              label={t(`privacy.${key}_title`)}
              onChange={(next) => void togglePrivacy(key, next)}
            />
          </div>
        ))}
      </div>

      <div className={panel.panel}>
        <div>
          <h4 className={panel.panelTitle}>{t('privacy.consentsTitle')}</h4>
          <p className={panel.panelDesc}>{t('privacy.consentsDesc')}</p>
        </div>
        {CONSENT_TYPES.map((type) => (
          <div key={type} className={styles.toggleRow}>
            <div>
              <h4 className={styles.toggleLabel}>{t(`privacy.${type}_title`)}</h4>
              <p className={styles.toggleDesc}>{t(`privacy.${type}_desc`)}</p>
            </div>
            <Toggle
              on={isGranted(type)}
              disabled={busy || consents === null}
              label={t(`privacy.${type}_title`)}
              onChange={(next) => void toggleConsent(type, next)}
            />
          </div>
        ))}
      </div>

      <div className={panel.panel}>
        <div>
          <h4 className={panel.panelTitle}>{t('privacy.dataTitle')}</h4>
          <p className={panel.panelDesc}>{t('privacy.dataDesc')}</p>
        </div>
        <div className={panel.actions}>
          <button type="button" className={panel.secondaryBtn} onClick={exportData} disabled={busy}>
            <Download size={14} /> {t('privacy.exportBtn')}
          </button>
        </div>
      </div>

      <div className={panel.panel}>
        <div>
          <h4 className={panel.panelTitle}>{t('privacy.restoreTitle')}</h4>
          <p className={panel.panelDesc}>{t('privacy.restoreDesc')}</p>
        </div>
        <div className={panel.actions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />
          <button
            type="button"
            className={panel.secondaryBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={14} /> {importing ? t('privacy.restoring') : t('privacy.restoreTitle')}
          </button>
        </div>
        {importHistory !== null && importHistory.length > 0 && (
          <table className={panel.table}>
            <thead>
              <tr>
                <th>{t('privacy.colDate')}</th>
                <th>{t('privacy.colStatus')}</th>
                <th>{t('privacy.colProjects')}</th>
                <th>{t('privacy.colNote')}</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.status}</td>
                  <td>{item.projects_imported}</td>
                  <td>{item.rejected_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.dangerZone}>
        <div className={styles.dangerHeader}>
          <AlertTriangle size={16} className={styles.dangerIcon} />
          <h4 className={styles.dangerTitle}>{t('privacy.dangerTitle')}</h4>
        </div>
        <p className={styles.dangerDesc}>{t('privacy.dangerDesc')}</p>
        <button
          type="button"
          className={styles.deleteAccountBtn}
          onClick={() => setConfirmDeleteOpen(true)}
        >
          {t('privacy.deleteBtn')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          setConfirmDeleteOpen(open);
          if (!open) setDeletePassword('');
        }}
        title={t('privacy.confirmTitle')}
        description={t('privacy.confirmDesc')}
        confirmLabel={t('privacy.deleteBtn')}
        onConfirm={() => void deleteAccount()}
      >
        <input
          type="password"
          className={styles.input}
          placeholder={t('privacy.password')}
          autoComplete="current-password"
          value={deletePassword}
          onChange={(event) => setDeletePassword(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
};
