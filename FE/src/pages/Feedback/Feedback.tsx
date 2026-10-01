import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Send, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import {
  studioApi,
  type Feedback as FeedbackItem,
  type FeedbackEligibility,
  type MarketingGroup,
} from '../../api/studio';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/format';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './Feedback.module.css';

const GROUPS: { value: MarketingGroup; labelKey: string }[] = [
  { value: 'product', labelKey: 'feedback.groupProduct' },
  { value: 'price', labelKey: 'feedback.groupPrice' },
  { value: 'place', labelKey: 'feedback.groupPlace' },
  { value: 'promotion', labelKey: 'feedback.groupPromotion' },
];

const STATUS_KEYS: Record<string, string> = {
  new: 'feedback.statusNew',
  reviewed: 'feedback.statusReviewed',
  planned: 'feedback.statusPlanned',
  done: 'feedback.statusDone',
  wont_do: 'feedback.statusWontDo',
};

const MAX_LENGTH = 2000;

/** Status indicator adhering to docs/DESIGN.md Section 5.7 (6px dot + 12px label) */
function FeedbackStatus({ status }: { status: string }) {
  const { t } = useTranslation('account');
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status;
  let color = 'var(--neutral)';
  if (status === 'done') color = 'var(--success)';
  else if (status === 'planned' || status === 'reviewed') color = 'var(--warning)';
  else if (status === 'wont_do') color = 'var(--neutral)';

  return (
    <span className={styles.statusIndicator}>
      <span className={styles.statusDot} style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}

export const Feedback: React.FC = () => {
  const { t } = useTranslation('account');
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [group, setGroup] = useState<MarketingGroup>('product');
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [eligibility, setEligibility] = useState<FeedbackEligibility | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, allowed] = await Promise.all([studioApi.myFeedback(), studioApi.eligibility()]);
      setItems(mine);
      setEligibility(allowed);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('feedback.loadError'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    eligibility?.can_submit !== false && rating > 0 && message.trim().length >= 3 && !submitting;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await studioApi.submitFeedback({ rating, message: message.trim(), marketing_group: group });
      toast(t('feedback.thanks'));
      setRating(0);
      setMessage('');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'FEEDBACK_TOO_SOON') await load();
      toast(caught instanceof Error ? caught.message : t('feedback.sendError'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Page Header - docs/DESIGN.md Section 6.1 (Row 1: 56px, no filler subtitle) */}
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{t('feedback.title')}</h1>
          {items !== null && items.length > 0 && (
            <span className={styles.count}>({items.length})</span>
          )}
        </div>
      </div>

      {/* Two-Column Layout - docs/DESIGN.md Section 4.3 */}
      <div className={styles.grid}>
        {/* Form Card */}
        <motion.form
          className={styles.card}
          onSubmit={submit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('feedback.shareTitle')}</h2>
          </div>

          {eligibility && !eligibility.can_submit && (
            <div className={styles.notice} role="status">
              <Clock size={16} className={styles.noticeIcon} />
              <span>
                {t('feedback.tooSoon', { date: formatDate(eligibility.next_allowed_at) })}
              </span>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('feedback.rateLabel')}</span>
            <div className={styles.stars} role="radiogroup" aria-label={t('feedback.rating')}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t('feedback.stars', { count: value })}
                  className={`${styles.star} ${value <= rating ? styles.starOn : ''}`}
                  onClick={() => setRating(value)}
                >
                  <Star size={22} fill={value <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('feedback.aboutLabel')}</span>
            <div className={styles.groups}>
              {GROUPS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.group} ${group === option.value ? styles.groupOn : ''}`}
                  onClick={() => setGroup(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback-message" className={styles.fieldLabel}>
              {t('feedback.messageLabel')}
            </label>
            <textarea
              id="feedback-message"
              className={styles.textarea}
              maxLength={MAX_LENGTH}
              placeholder={t('feedback.placeholder')}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <span className={styles.counter}>
              {t('feedback.counter', { n: message.length, max: MAX_LENGTH })}
            </span>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={!canSubmit}>
            <Send size={14} />{' '}
            <span>{submitting ? t('feedback.sending') : t('feedback.send')}</span>
          </button>
        </motion.form>

        {/* History Card - docs/DESIGN.md Section 5.12 */}
        <motion.div
          className={styles.card}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: 0.05 }}
        >
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('feedback.yourFeedback')}</h2>
          </div>

          {items === null ? (
            <LoadingDots center label={t('feedback.loading')} />
          ) : items.length === 0 ? (
            <p className={styles.muted}>{t('feedback.empty')}</p>
          ) : (
            <div className={styles.itemsList}>
              {items.map((item) => (
                <div key={item.id} className={styles.item}>
                  <div className={styles.itemHeader}>
                    <span
                      className={styles.itemStars}
                      aria-label={t('feedback.outOf5', { n: item.rating })}
                    >
                      {Array.from({ length: item.rating }, (_, index) => (
                        <Star key={index} size={12} fill="currentColor" />
                      ))}
                    </span>
                    <FeedbackStatus status={item.status} />
                    <span className={styles.itemDate}>{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className={styles.itemMessage}>{item.message}</p>
                  {item.changed_what && (
                    <div className={styles.changed}>
                      <strong>{t('feedback.changed')}</strong> {item.changed_what}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
