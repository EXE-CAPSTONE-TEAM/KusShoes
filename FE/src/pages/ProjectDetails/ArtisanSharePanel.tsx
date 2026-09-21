import React, { useCallback, useEffect, useState } from 'react';
import { Copy, FileText, Link2, RefreshCw, Share2 } from 'lucide-react';
import { ApiError } from '../../api/client';
import { studioApi, type ArtisanLink, type CreatedArtisanLink } from '../../api/studio';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import styles from './ProjectPanels.module.css';

interface ArtisanSharePanelProps {
  projectId: string;
  onUpgrade?: () => void;
}

const REASONS: Record<string, string> = {
  ARTISAN_LINK_PLAN_REQUIRED: 'Sharing with an artisan needs an active paid plan (not in the grace period).',
  EXPORT_NOT_READY: 'Export this project first: the artisan link shares an exported file.',
};

/** Craftsperson handoff (UC-26): a private expiring download link plus a PDF reference pack. */
export const ArtisanSharePanel: React.FC<ArtisanSharePanelProps> = ({ projectId, onUpgrade }) => {
  const { toast } = useToast();
  const [links, setLinks] = useState<ArtisanLink[] | null>(null);
  const [fresh, setFresh] = useState<CreatedArtisanLink | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks(await studioApi.listArtisanLinks(projectId));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to load share links.', 'error');
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setBlocked(null);
    try {
      setFresh(await studioApi.createArtisanLink(projectId));
      toast('Share link created. Copy it now: it is shown only once.', 'info');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code && REASONS[caught.code]) {
        setBlocked(REASONS[caught.code]);
      } else {
        toast(caught instanceof Error ? caught.message : 'Unable to create the link.', 'error');
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
      toast(caught instanceof Error ? caught.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      toast('Link copied.');
    } catch {
      toast('Unable to copy. Please select the link manually.', 'error');
    }
  };

  const downloadPack = async () => {
    setBusy(true);
    try {
      await studioApi.downloadReferencePack(projectId, fresh?.token);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to build the reference pack.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={`${styles.panel} glass-panel`}>
        <div className={styles.panelHeader}>
          <Share2 size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>Share with an artisan</h4>
            <p className={styles.panelDesc}>
              Create a private link to your latest export. It works for 30 days and up to 20 downloads, and you can
              revoke it at any time.
            </p>
          </div>
          <button type="button" className={`btn-neon-orange ${styles.headerAction}`} onClick={create} disabled={busy}>
            <Link2 size={16} /> New link
          </button>
        </div>

        {blocked && (
          <div className={styles.notice} role="alert">
            <span>{blocked}</span>
            {onUpgrade && blocked === REASONS.ARTISAN_LINK_PLAN_REQUIRED && (
              <button type="button" className="btn-outline" onClick={onUpgrade}>See plans</button>
            )}
          </div>
        )}

        {fresh && (
          <div className={styles.stack}>
            <div className={styles.linkBox}>
              <span className={styles.linkText}>{fresh.url}</span>
              <button type="button" className="btn-outline" onClick={copyLink}><Copy size={14} /> Copy</button>
            </div>
            <span className={styles.muted}>
              Anyone with this link can download the file until {formatDate(fresh.expires_at)}.
            </span>
          </div>
        )}

        {links === null ? (
          <p className={styles.muted}>Loading links…</p>
        ) : links.length === 0 ? (
          <p className={styles.muted}>No links yet.</p>
        ) : (
          links.map((link) => (
            <div key={link.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  Created link
                  <span className={`${styles.chip} ${link.is_active ? styles.chipOk : styles.chipOff}`}>
                    {link.revoked_at ? 'Revoked' : link.is_active ? 'Active' : 'Expired'}
                  </span>
                </span>
                <span className={styles.rowMeta}>
                  {link.download_count} / {link.max_downloads} downloads · expires {formatDate(link.expires_at)}
                </span>
              </div>
              <div className={styles.rowActions}>
                {!link.revoked_at && (
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={busy}
                    onClick={() => void act(() => studioApi.renewArtisanLink(link.id), 'Link renewed for another 30 days.')}
                  >
                    <RefreshCw size={14} /> Renew
                  </button>
                )}
                {link.is_active && (
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={busy}
                    onClick={() => void act(() => studioApi.revokeArtisanLink(link.id), 'Link revoked.')}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={`${styles.panel} glass-panel`}>
        <div className={styles.panelHeader}>
          <FileText size={20} className={styles.panelIcon} />
          <div>
            <h4 className={styles.panelTitle}>Reference pack (PDF)</h4>
            <p className={styles.panelDesc}>
              Colours, text and fonts, and the layer list for the workshop.
              {fresh ? ' It will include a QR code for the link you just created.' : ''}
            </p>
          </div>
          <button type="button" className={`btn-outline ${styles.headerAction}`} onClick={downloadPack} disabled={busy}>
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};
