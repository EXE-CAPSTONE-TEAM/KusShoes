import React, { useEffect, useState } from 'react';
import { Download, AlertTriangle, Loader2, Box } from 'lucide-react';
import { studioApi, type ArtisanPublicView } from '../../api/studio';
import { LoginBackdrop } from '../Login/LoginBackdrop';
import loginStyles from '../Login/Login.module.css';
import { ReportContentLink } from './ReportContentLink';
import styles from './ArtisanViewer.module.css';

/**
 * BR-101: public, unauthenticated page opened from a shared artisan link
 * (`{ARTISAN_VIEWER_BASE_URL}/{token}`, created in ArtisanSharePanel). Whoever holds the
 * link — no KusShoes account needed — can view the export and download it a limited number
 * of times before it expires.
 */
export const ArtisanViewer: React.FC = () => {
  const token = window.location.pathname.replace(/^\/artisan\//, '').replace(/\/$/, '');

  const [view, setView] = useState<ArtisanPublicView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This link is missing its token.');
      setLoading(false);
      return;
    }
    studioApi
      .getPublicArtisanLink(token)
      .then(setView)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Unable to load this link.');
      })
      .finally(() => setLoading(false));
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
      setError(caught instanceof Error ? caught.message : 'Unable to start the download.');
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
            <p>Loading shared file…</p>
          </div>
        ) : error ? (
          <div className={styles.state}>
            <AlertTriangle size={26} className={styles.errorIcon} />
            <p className={styles.errorText}>{error}</p>
            <p className={styles.hint}>
              Ask whoever sent you this link for a fresh one — links expire and have a limited
              number of downloads.
            </p>
          </div>
        ) : view ? (
          <>
            <h1 className={styles.title}>{view.project_name}</h1>
            <p className={styles.subtitle}>Shared for production — one KusShoes 3D export.</p>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Format</span>
                <span className={styles.metaValue}>{view.format.toUpperCase()}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Downloads left</span>
                <span className={styles.metaValue}>{view.downloads_remaining}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Expires</span>
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
              {view.downloads_remaining <= 0 ? 'No downloads left' : 'Download file'}
            </button>

            <ReportContentLink
              projectId={view.project_id}
              evidenceUrl={window.location.href}
              contextLabel={`"${view.project_name}"`}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
