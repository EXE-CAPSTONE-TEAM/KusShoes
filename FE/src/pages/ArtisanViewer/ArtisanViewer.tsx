import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Flag, RefreshCw } from 'lucide-react';
import { ApiError } from '../../api/client';
import { artisanPublicApi, type ArtisanPublicView, type ContentReportReason } from '../../api/artisanPublic';
import { useToast } from '../../context/ToastContext';
import { dictionaries } from '../../i18n/dictionaries';
import { formatDateTime } from '../../utils/format';
import styles from './ArtisanViewer.module.css';

type Status = 'loading' | 'ready' | 'invalid' | 'rate_limited' | 'error';

const t = dictionaries.vi.artisanViewer;
const tEn = dictionaries.en.artisanViewer;
/** This page has no logged-in owner to pick a language for, so every label ships bilingual. */
const bi = (key: keyof typeof t) => `${t[key]} / ${tEn[key]}`;

const REPORT_REASONS: { value: ContentReportReason; labelKey: keyof typeof t }[] = [
  { value: 'copyright', labelKey: 'reportReasonCopyright' },
  { value: 'trademark', labelKey: 'reportReasonTrademark' },
  { value: 'inappropriate', labelKey: 'reportReasonInappropriate' },
  { value: 'other', labelKey: 'reportReasonOther' },
];

interface ArtisanViewerProps {
  token: string;
}

/** BR-101 public share link viewer: no auth, no cookies — anyone with the link can open it. */
export const ArtisanViewer: React.FC<ArtisanViewerProps> = ({ token }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<ArtisanPublicView | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ContentReportReason>('copyright');
  const [reportDetails, setReportDetails] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setStatus('invalid');
      setErrorMessage(bi('invalidTitle'));
      return;
    }
    setStatus('loading');
    try {
      const view = await artisanPublicApi.view(token);
      setData(view);
      setStatus('ready');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 410) {
        setStatus('invalid');
        setErrorMessage(caught.message);
      } else if (caught instanceof ApiError && caught.status === 429) {
        setStatus('rate_limited');
        setErrorMessage(caught.message);
      } else {
        // Not an ApiError: a real network failure (offline, DNS, CORS) whose raw message
        // (e.g. "Failed to fetch") is meaningless to a public link recipient.
        setStatus('error');
        setErrorMessage(bi('networkErrorMessage'));
      }
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async () => {
    if (!token || downloading) return;
    setDownloading(true);
    try {
      const result = await artisanPublicApi.download(token);
      window.open(result.download_url, '_blank', 'noopener');
      toast(bi('downloadSuccess'));
      try {
        const refreshed = await artisanPublicApi.view(token);
        setData(refreshed);
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 410) {
          setStatus('invalid');
          setErrorMessage(refreshError.message);
        }
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 410) {
        setStatus('invalid');
        setErrorMessage(caught.message);
      } else if (caught instanceof ApiError && caught.status === 429) {
        setStatus('rate_limited');
        setErrorMessage(caught.message);
      } else {
        toast(bi('downloadError'), 'error');
      }
    } finally {
      setDownloading(false);
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || reportDetails.trim().length < 20 || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await artisanPublicApi.reportContent({
        project_id: data.project_id,
        reason: reportReason,
        details: reportDetails.trim(),
        reporter_email: reportEmail.trim() || undefined,
        evidence_url: window.location.href,
      });
      setReportSubmitted(true);
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : bi('reportError'), 'error');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={styles.muted}>{bi('loading')}</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className={styles.container}>
        <div className={styles.card} role="alert">
          <AlertTriangle size={32} className={styles.iconWarning} />
          <h1 className={styles.title}>{bi('invalidTitle')}</h1>
          <p className={styles.message}>{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (status === 'rate_limited') {
    return (
      <div className={styles.container}>
        <div className={styles.card} role="alert">
          <AlertTriangle size={32} className={styles.iconWarning} />
          <h1 className={styles.title}>{bi('rateLimitedTitle')}</h1>
          <p className={styles.message}>{errorMessage || bi('rateLimitedMessage')}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.card} role="alert">
          <AlertTriangle size={32} className={styles.iconWarning} />
          <h1 className={styles.title}>{bi('networkErrorTitle')}</h1>
          <p className={styles.message}>{errorMessage || bi('networkErrorMessage')}</p>
          <button type="button" className="btn-neon-orange" onClick={() => void load()}>
            <RefreshCw size={16} /> {bi('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{bi('title')}</h1>

        <dl className={styles.details}>
          <div className={styles.row}>
            <dt>{bi('project')}</dt>
            <dd>{data.project_name}</dd>
          </div>
          <div className={styles.row}>
            <dt>{bi('format')}</dt>
            <dd>{data.format}</dd>
          </div>
          <div className={styles.row}>
            <dt>{bi('expiresAt')}</dt>
            <dd>{formatDateTime(data.expires_at)}</dd>
          </div>
          <div className={styles.row}>
            <dt>{bi('downloadsRemaining')}</dt>
            <dd>{data.downloads_remaining}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn-neon-orange"
          onClick={() => void handleDownload()}
          disabled={downloading || data.downloads_remaining <= 0}
        >
          <Download size={16} /> {downloading ? bi('downloading') : bi('download')}
        </button>

        {reportSubmitted && <p className={styles.success}>{bi('reportSuccess')}</p>}

        {!reportOpen && !reportSubmitted && (
          <button type="button" className={styles.reportLink} onClick={() => setReportOpen(true)}>
            <Flag size={14} /> {bi('reportContent')}
          </button>
        )}

        {reportOpen && !reportSubmitted && (
          <form className={styles.reportForm} onSubmit={(event) => void submitReport(event)}>
            <h2 className={styles.reportTitle}>{bi('reportTitle')}</h2>

            <label className={styles.field}>
              <span>{bi('reportReason')}</span>
              <select
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as ContentReportReason)}
              >
                {REPORT_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {bi(reason.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>{bi('reportDetails')}</span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                minLength={20}
                maxLength={2000}
                required
              />
            </label>

            <label className={styles.field}>
              <span>{bi('reportEmail')}</span>
              <input type="email" value={reportEmail} onChange={(event) => setReportEmail(event.target.value)} />
            </label>

            <div className={styles.reportActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setReportOpen(false)}
                disabled={reportSubmitting}
              >
                {bi('reportCancel')}
              </button>
              <button
                type="submit"
                className="btn-neon-orange"
                disabled={reportSubmitting || reportDetails.trim().length < 20}
              >
                {reportSubmitting ? bi('reportSubmitting') : bi('reportSubmit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
