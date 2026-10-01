import React, { useCallback, useEffect, useState } from 'react';
import { Copy, FileText, Link2, RefreshCw, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { studioApi, type ArtisanLink, type CreatedArtisanLink } from '../../api/studio';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './ProjectPanels.module.css';

interface ArtisanSharePanelProps {
  projectId: string;
  onUpgrade?: () => void;
}

const REASON_CODES = ['ARTISAN_LINK_PLAN_REQUIRED', 'EXPORT_NOT_READY'];

/** Craftsperson handoff (UC-26): a private expiring download link plus a PDF reference pack. */
export const ArtisanSharePanel: React.FC<ArtisanSharePanelProps> = ({ projectId, onUpgrade }) => {
  const { t } = useTranslation('details');
  const { toast } = useToast();
  const [links, setLinks] = useState<ArtisanLink[] | null>(null);
  const [fresh, setFresh] = useState<CreatedArtisanLink | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks(await studioApi.listArtisanLinks(projectId));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('share.loadError'), 'error');
    }
  }, [projectId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setBlocked(null);
    try {
      setFresh(await studioApi.createArtisanLink(projectId));
      toast(t('share.created'), 'info');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code && REASON_CODES.includes(caught.code)) {
        setBlocked(caught.code);
      } else {
        toast(caught instanceof Error ? caught.message : t('share.createError'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast(success);
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('share.actionFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      toast(t('share.copied'));
    } catch {
      toast(t('share.copyError'), 'error');
    }
  };

  const downloadPack = async () => {
    setBusy(true);
    try {
      await studioApi.downloadReferencePack(projectId, fresh?.token);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('share.packError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <Share2 size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>{t('share.title')}</h4>
            <p className={styles.panelDesc}>
              {t('share.desc')}
            </p>
          </div>
          <button type="button" className={`${styles.btnPrimary} ${styles.headerAction}`} onClick={create} disabled={busy}>
            <Link2 size={16} /> {t('share.newLink')}
          </button>
        </div>

        {blocked && (
          <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
            <span>{t(`share.reasons.${blocked}`)}</span>
            {onUpgrade && blocked === 'ARTISAN_LINK_PLAN_REQUIRED' && (
              <button type="button" className={styles.btnSecondary} onClick={onUpgrade}>{t('share.seePlans')}</button>
            )}
          </div>
        )}

        {fresh && (
          <div className={styles.stack}>
            <div className={styles.linkBox}>
              <span className={styles.linkText}>{fresh.url}</span>
              <button type="button" className={`${styles.btnSecondary} ${styles.btnSm}`} onClick={copyLink}>
                <Copy size={14} /> {t('share.copy')}
              </button>
            </div>
            <span className={styles.muted}>
              {t('share.anyoneCan', { date: formatDate(fresh.expires_at) })}
            </span>
          </div>
        )}

        {links === null ? (
          <LoadingDots center label={t('share.loading')} />
        ) : links.length === 0 ? (
          <p className={styles.muted}>{t('share.empty')}</p>
        ) : (
          links.map((link) => {
            const statusLabel = link.revoked_at ? t('share.revoked') : link.is_active ? t('share.active') : t('share.expired');
            const statusColor = link.revoked_at
              ? 'var(--danger)'
              : link.is_active
                ? 'var(--success)'
                : 'var(--neutral)';
            return (
              <div key={link.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {t('share.createdLink')}
                    <span className={styles.statusIndicator}>
                      <span className={styles.statusDot} style={{ backgroundColor: statusColor }} />
                      {statusLabel}
                    </span>
                  </span>
                  <span className={styles.rowMeta}>
                    {t('share.meta', { count: link.download_count, max: link.max_downloads, date: formatDate(link.expires_at) })}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  {!link.revoked_at && (
                    <button
                      type="button"
                      className={`${styles.btnSecondary} ${styles.btnSm}`}
                      disabled={busy}
                      onClick={() => void act(() => studioApi.renewArtisanLink(link.id), t('share.renewed'))}
                    >
                      <RefreshCw size={14} /> {t('share.renew')}
                    </button>
                  )}
                  {link.is_active && (
                    <button
                      type="button"
                      className={`${styles.btnSecondary} ${styles.btnSm}`}
                      disabled={busy}
                      onClick={() => void act(() => studioApi.revokeArtisanLink(link.id), t('share.revokedToast'))}
                    >
                      {t('share.revoke')}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <FileText size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>{t('share.packTitle')}</h4>
            <p className={styles.panelDesc}>
              {t('share.packDesc')}
              {fresh ? t('share.packQr') : ''}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.btnSecondary} ${styles.headerAction}`}
            onClick={downloadPack}
            disabled={busy}
          >
            {t('share.packDownload')}
          </button>
        </div>
      </div>
    </div>
  );
};
