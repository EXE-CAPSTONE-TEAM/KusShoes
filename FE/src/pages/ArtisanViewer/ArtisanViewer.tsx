import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Flag, RefreshCw } from 'lucide-react';
import { ApiError } from '../../api/client';
import { artisanPublicApi, type ArtisanPublicView, type ContentReportReason } from '../../api/artisanPublic';
import { useToast } from '../../context/ToastContext';
import { artisanViewerText as t } from '../../i18n/dictionaries';
import { formatDateTime } from '../../utils/format';
import styles from './ArtisanViewer.module.css';

type Status = 'loading' | 'ready' | 'invalid' | 'rate_limited' | 'error';

const REPORT_REASONS: { value: ContentReportReason; labelKey: keyof typeof t }[] = [
  { value: 'copyright', labelKey: 'reportReasonCopyright' },
  { value: 'trademark', labelKey: 'reportReasonTrademark' },
  { value: 'inappropriate', labelKey: 'reportReasonInappropriate' },
  { value: 'other', labelKey: 'reportReasonOther' },
];

interface ArtisanViewerProps {
  token: string;
}

/** The invalid-link and rate-limited pages share the same alert-card shape as the error page. */
const StatusCard: React.FC<{ title: string; message?: string; children?: React.ReactNode }> = ({
  title,
  message,
  children,
}) => (
  <div className={styles.container}>
    <div className={styles.card} role="alert">
      <AlertTriangle size={32} className={styles.iconWarning} />
      <h1 className={styles.title}>{title}</h1>
      {message && <p className={styles.message}>{message}</p>}
      {children}
    </div>
  </div>
);

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

  /** The public link and download endpoints both fail the same way; report both identically. */
  const applyLinkError = (caught: unknown): boolean => {
    if (caught instanceof ApiError && caught.status === 410) {
      setStatus('invalid');
      setErrorMessage(caught.message);
      return true;
    }
    if (caught instanceof ApiError && caught.status === 429) {
      setStatus('rate_limited');
      setErrorMessage(caught.message);
      return true;
    }
    return false;
  };

  const load = useCallback(async () => {
    if (!token) {
      setStatus('invalid');
      setErrorMessage(t.invalidTitle);
      return;
    }
    setStatus('loading');
    try {
      const view = await artisanPublicApi.view(token);
      setData(view);
      setStatus('ready');
    } catch (caught) {
      // Not an ApiError: a real network failure (offline, DNS, CORS) whose raw message
      // (e.g. "Failed to fetch") is meaningless to a public link recipient.
      if (!applyLinkError(caught)) {
        setStatus('error');
        setErrorMessage(t.networkErrorMessage);
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
      toast(t.downloadSuccess);
      try {
        const refreshed = await artisanPublicApi.view(token);
        setData(refreshed);
      } catch (refreshError) {
        applyLinkError(refreshError);
      }
    } catch (caught) {
      if (!applyLinkError(caught)) {
        toast(t.downloadError, 'error');
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
      toast(caught instanceof ApiError ? caught.message : t.reportError, 'error');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={styles.muted}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return <StatusCard title={t.invalidTitle} message={errorMessage} />;
  }

  if (status === 'rate_limited') {
    return <StatusCard title={t.rateLimitedTitle} message={errorMessage || t.rateLimitedMessage} />;
  }

  if (status === 'error') {
    return (
      <StatusCard title={t.networkErrorTitle} message={errorMessage || t.networkErrorMessage}>
        <button type="button" className="btn-neon-orange" onClick={() => void load()}>
          <RefreshCw size={16} /> {t.retry}
        </button>
      </StatusCard>
    );
  }

  if (!data) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t.title}</h1>

        <dl className={styles.details}>
          {[
            { label: t.project, value: data.project_name },
            { label: t.format, value: data.format },
            { label: t.expiresAt, value: formatDateTime(data.expires_at) },
            { label: t.downloadsRemaining, value: data.downloads_remaining },
          ].map((row) => (
            <div className={styles.row} key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          className="btn-neon-orange"
          onClick={() => void handleDownload()}
          disabled={downloading || data.downloads_remaining <= 0}
        >
          <Download size={16} /> {downloading ? t.downloading : t.download}
        </button>

        {reportSubmitted && <p className={styles.success}>{t.reportSuccess}</p>}

        {!reportOpen && !reportSubmitted && (
          <button type="button" className={styles.reportLink} onClick={() => setReportOpen(true)}>
            <Flag size={14} /> {t.reportContent}
          </button>
        )}

        {reportOpen && !reportSubmitted && (
          <form className={styles.reportForm} onSubmit={(event) => void submitReport(event)}>
            <h2 className={styles.reportTitle}>{t.reportTitle}</h2>

            <label className={styles.field}>
              <span>{t.reportReason}</span>
              <select
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as ContentReportReason)}
              >
                {REPORT_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {t[reason.labelKey]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>{t.reportDetails}</span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                minLength={20}
                maxLength={2000}
                required
              />
            </label>

            <label className={styles.field}>
              <span>{t.reportEmail}</span>
              <input type="email" value={reportEmail} onChange={(event) => setReportEmail(event.target.value)} />
            </label>

            <div className={styles.reportActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setReportOpen(false)}
                disabled={reportSubmitting}
              >
                {t.reportCancel}
              </button>
              <button
                type="submit"
                className="btn-neon-orange"
                disabled={reportSubmitting || reportDetails.trim().length < 20}
              >
                {reportSubmitting ? t.reportSubmitting : t.reportSubmit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
