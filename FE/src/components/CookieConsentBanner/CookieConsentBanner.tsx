import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCookieConsent,
  onCookieConsentChange,
  onOpenCookieSettings,
  saveCookieConsent,
} from '../../analytics';
import styles from './CookieConsentBanner.module.css';

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
          <li>
            <label className={styles.category}>
              <input type="checkbox" checked disabled readOnly />
              <span>
                <strong>{t('cookieConsent.necessary')}</strong>
                <small>{t('cookieConsent.necessaryDesc')}</small>
              </span>
            </label>
          </li>
          <li>
            <label className={styles.category}>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span>
                <strong>{t('cookieConsent.analytics')}</strong>
                <small>{t('cookieConsent.analyticsDesc')}</small>
              </span>
            </label>
          </li>
          <li>
            <label className={styles.category}>
              <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} />
              <span>
                <strong>{t('cookieConsent.ads')}</strong>
                <small>{t('cookieConsent.adsDesc')}</small>
              </span>
            </label>
          </li>
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
