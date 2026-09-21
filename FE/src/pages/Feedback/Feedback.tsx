import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Send, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { ApiError } from '../../api/client';
import {
  studioApi,
  type Feedback as FeedbackItem,
  type FeedbackEligibility,
  type MarketingGroup,
} from '../../api/studio';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/format';
import styles from './Feedback.module.css';

const GROUPS: { value: MarketingGroup; label: string }[] = [
  { value: 'product', label: 'Product & features' },
  { value: 'price', label: 'Pricing & plans' },
  { value: 'place', label: 'Where to find us' },
  { value: 'promotion', label: 'Offers & content' },
];

const STATUS_LABELS: Record<string, string> = {
  new: 'Received',
  reviewed: 'Reviewed',
  planned: 'Planned',
  done: 'Done',
  wont_do: 'Not planned',
};

const MAX_LENGTH = 2000;

export const Feedback: React.FC = () => {
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
      toast(caught instanceof Error ? caught.message : 'Unable to load your feedback.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit = eligibility?.can_submit !== false && rating > 0 && message.trim().length >= 3 && !submitting;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await studioApi.submitFeedback({ rating, message: message.trim(), marketing_group: group });
      toast('Thank you! Your feedback was sent to the team.');
      setRating(0);
      setMessage('');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'FEEDBACK_TOO_SOON') await load();
      toast(caught instanceof Error ? caught.message : 'Unable to send your feedback.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.title}>Feedback</h1>
        <p className={styles.subtitle}>Tell us what works and what does not. We read every message.</p>
      </div>

      <div className={styles.grid}>
        <motion.form
          className={`${styles.card} glass-panel`}
          onSubmit={submit}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className={styles.cardTitle}>Share your thoughts</h3>

          {eligibility && !eligibility.can_submit && (
            <div className={styles.notice} role="status">
              <Clock size={16} />
              <span>
                You have sent feedback recently. You can send another on {formatDate(eligibility.next_allowed_at)}.
              </span>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>How would you rate KusShoes?</span>
            <div className={styles.stars} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value > 1 ? 's' : ''}`}
                  className={`${styles.star} ${value <= rating ? styles.starOn : ''}`}
                  onClick={() => setRating(value)}
                >
                  <Star size={28} fill={value <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>What is it about?</span>
            <div className={styles.groups}>
              {GROUPS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.group} ${group === option.value ? styles.groupOn : ''}`}
                  onClick={() => setGroup(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback-message">Your message</label>
            <textarea
              id="feedback-message"
              className={styles.textarea}
              maxLength={MAX_LENGTH}
              placeholder="What should we improve, or what did you like?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <span className={styles.counter}>{message.length} / {MAX_LENGTH}</span>
          </div>

          <button type="submit" className="btn-neon-orange" disabled={!canSubmit} style={{ alignSelf: 'flex-start' }}>
            <Send size={16} /> {submitting ? 'Sending…' : 'Send feedback'}
          </button>
        </motion.form>

        <motion.div
          className={`${styles.card} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className={styles.cardTitle}>Your feedback</h3>
          {items === null ? (
            <p className={styles.muted}>Loading…</p>
          ) : items.length === 0 ? (
            <p className={styles.muted}>You have not sent any feedback yet.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemStars} aria-label={`${item.rating} out of 5`}>
                    {Array.from({ length: item.rating }, (_, index) => (
                      <Star key={index} size={14} fill="currentColor" />
                    ))}
                  </span>
                  <span
                    className={`${styles.chip} ${item.status === 'done' ? styles.chipDone : ''} ${item.status === 'planned' ? styles.chipPlanned : ''}`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  <span className={styles.itemDate}>{formatDateTime(item.created_at)}</span>
                </div>
                <p className={styles.itemMessage}>{item.message}</p>
                {item.changed_what && (
                  <div className={styles.changed}>
                    <strong>What we changed:</strong> {item.changed_what}
                  </div>
                )}
              </div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  );
};
