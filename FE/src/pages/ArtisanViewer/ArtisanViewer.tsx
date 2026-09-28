import React, { useEffect, useState } from 'react';
import { Download, AlertTriangle, Loader2, Box } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { studioApi, type ArtisanPublicView } from '../../api/studio';
import { LoginBackdrop } from '../Login/LoginBackdrop';
import loginStyles from '../Login/Login.module.css';
import styles from './ArtisanViewer.module.css';

/**
 * BR-101: public, unauthenticated page opened from a shared artisan link
 * (`{ARTISAN_VIEWER_BASE_URL}/{token}`, created in ArtisanSharePanel). Whoever holds the
 * link — no KusShoes account needed — can view the export and download it a limited number
 * of times before it expires.
 */
export const ArtisanViewer: React.FC = () => {
  const { t } = useTranslation('artisan');
  const token = window.location.pathname.replace(/^\/artisan\//, '').replace(/\/$/, '');

  const [view, setView] = useState<ArtisanPublicView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('missingToken'));
      setLoading(false);
      return;
    }
    studioApi
      .getPublicArtisanLink(token)
      .then(setView)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : t('loadError'));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const result = await studioApi.downloadPublicArtisanLink(token);
      window.location.assign(result.download_url);
      setView((prev) =>
        prev ? { ...prev, downloads_remaining: prev.downloads_remaining - 1 } : prev,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('downloadError'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={loginStyles.container}>
      <LoginBackdrop />
      <div className={`${styles.card} glass-panel`}>
        <div className={styles.brand}>
          <Box size={20} />
          <span>KusShoes</span>
        </div>

        {loading ? (
          <div className={styles.state}>
            <Loader2 size={26} className={loginStyles.spin} />
            <p>{t('loading')}</p>
          </div>
        ) : error ? (
          <div className={styles.state}>
            <AlertTriangle size={26} className={styles.errorIcon} />
            <p className={styles.errorText}>{error}</p>
            <p className={styles.hint}>{t('expiredHint')}</p>
          </div>
        ) : view ? (
          <>
            <h1 className={styles.title}>{view.project_name}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t('format')}</span>
                <span className={styles.metaValue}>{view.format.toUpperCase()}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t('downloadsLeft')}</span>
                <span className={styles.metaValue}>{view.downloads_remaining}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t('expires')}</span>
                <span className={styles.metaValue}>
                  {new Date(view.expires_at).toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-neon-orange"
              onClick={() => void handleDownload()}
              disabled={downloading || view.downloads_remaining <= 0}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            >
              {downloading ? (
                <Loader2 size={18} className={loginStyles.spin} />
              ) : (
                <Download size={18} />
              )}
              {view.downloads_remaining <= 0 ? t('noDownloadsLeft') : t('downloadFile')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};
