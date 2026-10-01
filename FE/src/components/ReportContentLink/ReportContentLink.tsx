import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { accountApi, type ContentReportReason } from '../../api/account';
import styles from './ReportContentLink.module.css';

type ReportTarget = { projectId: string } | { templateId: string };

interface ReportContentLinkProps {
  /** Exactly one real, existing target — the API rejects anything else. */
  target: ReportTarget;
  /** Human label for what's being reported, shown in the trigger link (e.g. a template name). */
  contextLabel: string;
  /** Defaults to the current page URL — lets a moderator open exactly what was flagged. */
  evidenceUrl?: string;
}

const REASONS: ContentReportReason[] = ['copyright', 'trademark', 'inappropriate', 'other'];

/**
 * BR-77 / UC-24: a signed-in user's "flag this" action for content someone else made —
 * a community template, another creator's shared project, etc. The backend endpoint itself
 * takes no auth (so a report still works even if the session expires mid-flow), but this
 * component is only ever shown inside the authenticated app, never on a public/anonymous page.
 */
export const ReportContentLink: React.FC<ReportContentLinkProps> = ({
  target,
  contextLabel,
  evidenceUrl,
}) => {
  const { t } = useTranslation('account');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ContentReportReason>('copyright');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (details.trim().length < 20) {
      setError(t('report.tooShort'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await accountApi.submitContentReport({
        ...('projectId' in target
          ? { projectId: target.projectId }
          : { templateId: target.templateId }),
        reason,
        details: details.trim(),
        reporterEmail: email.trim() || null,
        evidenceUrl: evidenceUrl ?? window.location.href,
      });
      setReportId(result.report_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('report.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (reportId) {
    return (
      <p className={styles.confirmed}>
        {t('report.confirmed')} <code>{reportId.slice(0, 8)}</code>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Flag size={13} />
        {t('report.trigger', { label: contextLabel })}
      </button>
    );
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      <div className={styles.formHeader}>
        <span>{t('report.header')}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setOpen(false)}
          aria-label={t('report.close')}
        >
          <X size={14} />
        </button>
      </div>
      <select
        className={styles.select}
        value={reason}
        onChange={(event) => setReason(event.target.value as ContentReportReason)}
      >
        {REASONS.map((option) => (
          <option key={option} value={option}>
            {t(`report.${option}`)}
          </option>
        ))}
      </select>
      <textarea
        className={styles.textarea}
        placeholder={t('report.details')}
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        rows={3}
      />
      <input
        type="email"
        className={styles.input}
        placeholder={t('report.email')}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className="btn-outline" disabled={submitting}>
        {submitting ? t('report.submitting') : t('report.submit')}
      </button>
    </form>
  );
};
