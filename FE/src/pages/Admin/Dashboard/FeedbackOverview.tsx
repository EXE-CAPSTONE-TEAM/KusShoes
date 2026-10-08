import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { adminFeedback } from '../../../api/adminClient';
import type { AdminFeedback, FeedbackStatus, FeedbackSummary } from '../../../types/admin';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { ThreeDotsBlockLoader } from '../../../components/Admin/ThreeDotsLoader';
import shared from '../admin-shared.module.css';
import styles from './AdminDashboard.module.css';

const LATEST_COUNT = 5;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'Mới',
  reviewed: 'Đã xem',
  planned: 'Đã lên kế hoạch',
  done: 'Hoàn thành',
  wont_do: 'Không thực hiện',
};

const STATUS_TONE: Record<FeedbackStatus, 'warn' | 'info' | 'ok' | 'muted'> = {
  new: 'warn',
  reviewed: 'info',
  planned: 'info',
  done: 'ok',
  wont_do: 'muted',
};

const GROUP_LABELS: Record<string, string> = {
  product: 'Sản phẩm',
  price: 'Giá',
  place: 'Kênh phân phối',
  promotion: 'Truyền thông',
};

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <span className={styles.feedbackStars} aria-label={`${value} sao`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={13} fill={n <= Math.round(value) ? 'currentColor' : 'none'} />
    ))}
  </span>
);

interface FeedbackOverviewProps {
  navigate?: (page: string) => void;
}

export const FeedbackOverview: React.FC<FeedbackOverviewProps> = ({ navigate }) => {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [latest, setLatest] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([adminFeedback.summary(), adminFeedback.list()])
      .then(([stats, list]) => {
        if (!active) return;
        setSummary(stats);
        setLatest(list.slice(0, LATEST_COUNT));
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeaderRow}>
        <div>
          <h3 className={styles.chartTitle}>Đánh giá của người dùng</h3>
          <p className={styles.chartSubtitle}>
            Điểm hài lòng và các phản hồi mới nhất (không gồm tài khoản nội bộ)
          </p>
        </div>
        {navigate && (
          <button className={styles.viewAllLink} onClick={() => navigate('feedback')}>
            Xem tất cả →
          </button>
        )}
      </div>

      {loading && <ThreeDotsBlockLoader text="Đang tải đánh giá người dùng..." minHeight={120} />}
      {!loading && failed && (
        <div className={shared.emptyState}>Không thể tải đánh giá người dùng.</div>
      )}

      {!loading && !failed && summary && (
        <>
          <div className={styles.feedbackSummaryRow}>
            <div className={styles.feedbackScore}>
              <span className={styles.feedbackScoreValue}>
                {summary.count > 0 ? summary.average_rating.toFixed(1) : '—'}
              </span>
              <Stars value={summary.average_rating} />
              <span className={styles.chartSubtitle}>{summary.count.toLocaleString('vi-VN')} phản hồi</span>
            </div>
            <div className={styles.feedbackChips}>
              {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((key) => (
                <span key={key} className={styles.feedbackChip}>
                  {STATUS_LABELS[key]}
                  <strong>{summary.by_status[key] ?? 0}</strong>
                </span>
              ))}
              {Object.entries(summary.by_group).map(([key, count]) => (
                <span key={key} className={styles.feedbackChip}>
                  {GROUP_LABELS[key] ?? key}
                  <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.activityList}>
            {latest.map((item) => (
              <div key={item.id} className={styles.feedbackItem}>
                <div className={styles.feedbackItemHead}>
                  <Stars value={item.rating} />
                  <span className={styles.activityMeta}>
                    {item.user_email ?? 'Ẩn danh'} · {GROUP_LABELS[item.marketing_group] ?? item.marketing_group} ·{' '}
                    {new Date(item.created_at).toLocaleDateString('vi-VN')}
                  </span>
                  <StatusBadge
                    status={item.status}
                    tone={STATUS_TONE[item.status]}
                    label={STATUS_LABELS[item.status]}
                  />
                </div>
                <p className={styles.feedbackMessage}>{item.message}</p>
              </div>
            ))}
            {latest.length === 0 && (
              <div className={shared.emptyState}>Chưa có đánh giá nào từ người dùng.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
