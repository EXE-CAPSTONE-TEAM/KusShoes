import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCookieConsent,
  onCookieConsentChange,
  onOpenCookieSettings,
  saveCookieConsent,
} from '../../analytics';
import styles from './CookieConsentBanner.module.css';

interface ConsentCategoryProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  /** Omitted for the always-on category, which is shown checked and disabled. */
  onChange?: (checked: boolean) => void;
}

const ConsentCategory: React.FC<ConsentCategoryProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
}) => (
  <li className={styles.category}>
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={!onChange}
      readOnly={!onChange}
      aria-describedby={`${id}-desc`}
      onChange={onChange && ((e) => onChange(e.target.checked))}
    />
    <div>
      <label htmlFor={id}>{label}</label>
      <small id={`${id}-desc`}>{description}</small>
    </div>
  </li>
);

interface CookieConsentBannerProps {
  navigate: (path: string) => void;
}

/**
 * Asks for analytics/advertising consent until the visitor decides. Rejecting is as easy as
 * accepting; nothing beyond necessary storage is granted before a choice (see index.html).
 */
export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ navigate }) => {
  const { t } = useTranslation();
  // Opens once the webfonts are in: text reflowing inside a bottom-anchored card would count as
  // a layout shift (CLS), while a card that appears already laid out does not.
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [ads, setAds] = useState(false);
  const idPrefix = useId();

  useEffect(() => {
    let cancelled = false;
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled && getCookieConsent() === null) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reopen = () => {
      const saved = getCookieConsent();
      setAnalytics(saved?.analytics ?? false);
      setAds(saved?.ads ?? false);
      setCustomizing(true);
      setOpen(true);
    };
    const unsubscribeOpen = onOpenCookieSettings(reopen);
    // Any saved choice (here or in Settings → Privacy) closes the banner.
    const unsubscribeChange = onCookieConsentChange(() => setOpen(false));
    return () => {
      unsubscribeOpen();
      unsubscribeChange();
    };
  }, []);

  if (!open) return null;

  return (
    <dialog open className={styles.banner} aria-labelledby="cookie-consent-title">
      <h2 id="cookie-consent-title" className={styles.title}>
        {t('cookieConsent.title')}
      </h2>
      <p className={styles.body}>
        {t('cookieConsent.body')}{' '}
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            navigate('/privacy');
          }}
        >
          {t('cookieConsent.privacyLink')}
        </a>
      </p>

      {customizing && (
        <ul className={styles.categories}>
          <ConsentCategory
            id={`${idPrefix}-necessary`}
            label={t('cookieConsent.necessary')}
            description={t('cookieConsent.necessaryDesc')}
            checked
          />
          <ConsentCategory
            id={`${idPrefix}-analytics`}
            label={t('cookieConsent.analytics')}
            description={t('cookieConsent.analyticsDesc')}
            checked={analytics}
            onChange={setAnalytics}
          />
          <ConsentCategory
            id={`${idPrefix}-ads`}
            label={t('cookieConsent.ads')}
            description={t('cookieConsent.adsDesc')}
            checked={ads}
            onChange={setAds}
          />
        </ul>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => saveCookieConsent({ analytics: false, ads: false })}
        >
          {t('cookieConsent.rejectAll')}
        </button>
        {customizing ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => saveCookieConsent({ analytics, ads })}
          >
            {t('cookieConsent.save')}
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => setCustomizing(true)}>
            {t('cookieConsent.customize')}
          </button>
        )}
        <button
          type="button"
          className={styles.primary}
          onClick={() => saveCookieConsent({ analytics: true, ads: true })}
        >
          {t('cookieConsent.acceptAll')}
        </button>
      </div>
    </dialog>
  );
};
