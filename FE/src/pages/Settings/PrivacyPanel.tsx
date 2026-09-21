import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import {
  accountApi,
  type ConsentRecord,
  type ConsentType,
  type PrivacySettings,
} from '../../api/account';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import styles from './Settings.module.css';
import panel from './AccountPanels.module.css';

const PRIVACY_OPTIONS: { key: keyof PrivacySettings; title: string; desc: string }[] = [
  { key: 'is_profile_public', title: 'Public profile', desc: 'Let other people view your designer profile.' },
  { key: 'show_designs_publicly', title: 'Show my designs publicly', desc: 'Display your designs in the community showcase.' },
  { key: 'is_searchable', title: 'Appear in search', desc: 'Allow your profile to be found by name or username.' },
  { key: 'allow_analytics', title: 'Usage analytics', desc: 'Share anonymous usage data to help us improve KusShoes.' },
  { key: 'allow_ads_personalization', title: 'Personalised offers', desc: 'Use your activity to tailor promotions we show you.' },
];

const CONSENT_OPTIONS: { type: ConsentType; title: string; desc: string }[] = [
  { type: 'marketing_content', title: 'Marketing content', desc: 'Allow KusShoes to feature your designs or videos in marketing.' },
  { type: 'academic_report', title: 'Academic reporting', desc: 'Allow your shortened name to appear in project reports.' },
  { type: 'cookie_analytics', title: 'Analytics cookies', desc: 'Allow non-essential cookies used for analytics.' },
];

const Toggle: React.FC<{ on: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void }> = ({
  on,
  disabled,
  label,
  onChange,
}) => (
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
  const { toast } = useToast();
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const load = useCallback(async () => {
    try {
      const [settings, records] = await Promise.all([accountApi.getPrivacy(), accountApi.listConsents()]);
      setPrivacy(settings);
      setConsents(records);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to load privacy settings.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePrivacy = async (key: keyof PrivacySettings, next: boolean) => {
    if (!privacy) return;
    const previous = privacy;
    setPrivacy({ ...privacy, [key]: next }); // optimistic; rolled back if the server refuses
    try {
      setPrivacy(await accountApi.updatePrivacy({ [key]: next }));
    } catch (caught) {
      setPrivacy(previous);
      toast(caught instanceof Error ? caught.message : 'Unable to save that setting.', 'error');
    }
  };

  const isGranted = (type: ConsentType) =>
    Boolean(consents?.some((record) => record.type === type && record.revoked_at === null));

  const toggleConsent = async (type: ConsentType, granted: boolean) => {
    setBusy(true);
    try {
      await accountApi.recordConsent(type, granted);
      setConsents(await accountApi.listConsents());
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to save your choice.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const result = await accountApi.requestDataExport();
      window.open(result.download_url, '_blank', 'noopener');
      toast('Your data export is ready. The link expires in 15 minutes.', 'info');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to prepare your export.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await accountApi.deleteAccount(deletePassword);
      toast('Account deleted. You can restore it within 30 days from the sign-in page.', 'info');
      await api.logout();
      window.setTimeout(() => window.location.assign('/'), 1200);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to delete the account.', 'error');
      setBusy(false);
    } finally {
      setDeletePassword('');
    }
  };

  return (
    <div className={panel.grid2}>
      <div className={`${panel.panel} glass-panel`}>
        <div>
          <h4 className={panel.panelTitle}>Profile visibility</h4>
          <p className={panel.panelDesc}>Everything is private by default. Turn on only what you want to share.</p>
        </div>
        {PRIVACY_OPTIONS.map((option) => (
          <div key={option.key} className={styles.toggleRow}>
            <div>
              <h4 className={styles.toggleLabel}>{option.title}</h4>
              <p className={styles.toggleDesc}>{option.desc}</p>
            </div>
            <Toggle
              on={Boolean(privacy?.[option.key])}
              disabled={!privacy}
              label={option.title}
              onChange={(next) => void togglePrivacy(option.key, next)}
            />
          </div>
        ))}
      </div>

      <div className={`${panel.panel} glass-panel`}>
        <div>
          <h4 className={panel.panelTitle}>Consents</h4>
          <p className={panel.panelDesc}>Optional permissions you can grant or withdraw at any time.</p>
        </div>
        {CONSENT_OPTIONS.map((option) => (
          <div key={option.type} className={styles.toggleRow}>
            <div>
              <h4 className={styles.toggleLabel}>{option.title}</h4>
              <p className={styles.toggleDesc}>{option.desc}</p>
            </div>
            <Toggle
              on={isGranted(option.type)}
              disabled={busy || consents === null}
              label={option.title}
              onChange={(next) => void toggleConsent(option.type, next)}
            />
          </div>
        ))}
      </div>

      <div className={`${panel.panel} glass-panel`}>
        <div>
          <h4 className={panel.panelTitle}>Your data</h4>
          <p className={panel.panelDesc}>
            Download a copy of your profile, projects, consents and sign-in history. One export every 24 hours.
          </p>
        </div>
        <div className={panel.actions}>
          <button type="button" className="btn-outline" onClick={exportData} disabled={busy}>
            <Download size={16} /> Export my data
          </button>
        </div>
      </div>

      <div className={styles.dangerZone}>
        <div className={styles.dangerHeader}>
          <AlertTriangle size={18} className={styles.dangerIcon} />
          <h4 className={styles.dangerTitle}>Danger Zone</h4>
        </div>
        <p className={styles.dangerDesc}>
          Delete your account and all 3D shoe designs. You can restore the account within 30 days; after that it is
          erased permanently.
        </p>
        <button type="button" className={styles.deleteAccountBtn} onClick={() => setConfirmDeleteOpen(true)}>
          Delete Account
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          setConfirmDeleteOpen(open);
          if (!open) setDeletePassword('');
        }}
        title="Delete your account?"
        description="Your profile, projects and designs will be removed after 30 days. Enter your password to confirm (skip it if you sign in with Google)."
        confirmLabel="Delete Account"
        onConfirm={() => void deleteAccount()}
      >
        <input
          type="password"
          className={styles.input}
          placeholder="Password"
          autoComplete="current-password"
          value={deletePassword}
          onChange={(event) => setDeletePassword(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
};
