import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { ConsentCheckbox } from './ConsentCheckbox';
import styles from './LegalConsentGate.module.css';

interface LegalConsentGateProps {
  /** Settings stays reachable so a user who declines can still export data or delete the account. */
  activePage: string;
  onLogout: () => void;
}

/**
 * Blocks the portal until the signed-in user has agreed to the current Terms of Service and
 * Privacy Policy (GET /users/me `legal_consent_required`), e.g. accounts created before the
 * documents were published.
 */
export const LegalConsentGate: React.FC<LegalConsentGateProps> = ({ activePage, onLogout }) => {
  const { t } = useTranslation('auth');
  const [required, setRequired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .profile()
      .then((profile) => {
        if (active) setRequired(Boolean(profile.legal_consent_required));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!required || activePage === 'settings') return null;

  const accept = async () => {
    if (!agreed) {
      setError(t('login.agreeTermsRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const profile = await api.acceptLegalDocuments();
      setRequired(Boolean(profile.legal_consent_required));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <div className={styles.dialog}>
        <ShieldCheck size={28} className={styles.icon} aria-hidden="true" />
        <h2 id="legal-consent-title">{t('legalGate.title')}</h2>
        <p>{t('legalGate.body')}</p>
        <ConsentCheckbox className={styles.checkRow} checked={agreed} onChange={setAgreed} />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onLogout}>
            {t('legalGate.logout')}
          </button>
          <button type="button" className="btn-neon-orange" onClick={() => void accept()} disabled={saving}>
            {saving ? t('legalGate.saving') : t('legalGate.accept')}
          </button>
        </div>
        <p className={styles.hint}>{t('legalGate.declineHint')}</p>
      </div>
    </div>
  );
};
