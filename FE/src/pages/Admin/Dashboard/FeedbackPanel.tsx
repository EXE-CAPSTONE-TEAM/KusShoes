import React, { useEffect, useState } from 'react';
import { adminFeedback } from '../../../api/adminClient';
import type { FeedbackSummary } from '../../../types/admin';
import { HorizontalBarList } from '../../../components/Admin/HorizontalBarList';
import { ThreeDotsBlockLoader, ThreeDotsLoader } from '../../../components/Admin/ThreeDotsLoader';
import styles from './AdminDashboard.module.css';

interface FeedbackPanelProps {
  navigate?: (page: string) => void;
  /** Tăng giá trị này để tải lại dữ liệu (nút "Làm mới" của banner). */
  refreshKey?: number;
}

const LABELS = {
  sectionTitle: 'Phản hồi người dùng',
  sectionSubtitle: 'Mức độ hài lòng và tiến độ xử lý góp ý',
  total: 'Tổng phản hồi',
  totalCaption: 'Tất cả góp ý đã ghi nhận',
  rating: 'Điểm hài lòng trung bình',
  ratingCaption: 'Thang điểm 1–5 sao',
  pending: 'Chưa xử lý',
  pendingCaption: 'Phản hồi ở trạng thái Mới, cần được xem xét',
  resolved: 'Tỷ lệ hoàn thành',
  groupTitle: 'Phản hồi theo nhóm 4P',
  statusTitle: 'Tiến độ xử lý',
  empty: 'Chưa có phản hồi.',
  detailLink: 'Quản lý phản hồi →',
  loadError: 'Không tải được dữ liệu phản hồi.',
  retry: 'Thử lại',
  loadingChart: 'Đang tải dữ liệu phản hồi...',
  noValue: '—',
};

// Nhãn khớp với trang Quản lý phản hồi (AdminFeedbackPage).
const STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  reviewed: 'Đã xem',
  planned: 'Đã lên kế hoạch',
  done: 'Hoàn thành',
  wont_do: 'Không thực hiện',
};

// Màu theo ngữ nghĩa DS §3.1: chờ xử lý = hổ phách, hoàn thành = xanh lá, đang xử lý = xanh tài chính.
const STATUS_COLORS: Record<string, string> = {
  new: 'var(--fin-amber)',
  reviewed: 'var(--fin-blue)',
  planned: 'var(--fin-blue)',
  done: 'var(--fin-green)',
  wont_do: 'var(--text-muted)',
};

const GROUP_LABELS: Record<string, string> = {
  product: 'Sản phẩm',
  price: 'Giá',
  place: 'Kênh phân phối',
  promotion: 'Truyền thông',
};

const formatCount = (v: number) => `${v.toLocaleString('vi-VN')} phản hồi`;

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ navigate, refreshKey = 0 }) => {
  const [data, setData] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminFeedback
      .summary()
      .then((res) => {
        if (!active) return;
        setData(res);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, retryKey]);

  const busy = loading && !data;
  const value = (v: string | null) => (busy ? <ThreeDotsLoader size="md" /> : (v ?? LABELS.noValue));
  const pending = data?.by_status.new ?? 0;
  const done = data?.by_status.done ?? 0;
  const doneRate = data && data.count > 0 ? `${((done / data.count) * 100).toFixed(1)}%` : null;

  const toItems = (counts: Record<string, number>, labels: Record<string, string>, colors?: Record<string, string>) =>
    Object.entries(labels).map(([key, label]) => ({
      key,
      label,
      value: counts[key] ?? 0,
      fraction: data && data.count > 0 ? (counts[key] ?? 0) / data.count : 0,
      color: colors?.[key] ?? 'var(--fin-blue)',
    }));

  return (
    <div className={styles.sectionWrapper}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>{LABELS.sectionTitle}</h2>
        </div>
        <span className={styles.sectionSubtitle}>{LABELS.sectionSubtitle}</span>
      </div>

      {failed && (
        <div role="alert">
          {LABELS.loadError}{' '}
          <button type="button" className={styles.bannerBtn} onClick={() => setRetryKey((k) => k + 1)}>
            <span>{LABELS.retry}</span>
          </button>
        </div>
      )}

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.total}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(data && data.count.toLocaleString('vi-VN'))}</span>
          </div>
          <span className={styles.kpiCaption}>{LABELS.totalCaption}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.rating}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {value(data && data.count > 0 ? `${data.average_rating.toFixed(2)} / 5` : null)}
            </span>
          </div>
          <span className={styles.kpiCaption}>{LABELS.ratingCaption}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.pending}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={`${styles.kpiValue} ${pending > 0 ? styles.kpiValueWarn : ''}`}>
              {value(data && pending.toLocaleString('vi-VN'))}
            </span>
          </div>
          <span className={styles.kpiCaption}>{LABELS.pendingCaption}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.resolved}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(data && doneRate)}</span>
          </div>
          <span className={styles.kpiCaption}>
            {data ? `${done.toLocaleString('vi-VN')} / ${data.count.toLocaleString('vi-VN')} phản hồi đã hoàn thành` : ''}
          </span>
        </div>
      </div>

      <div className={styles.chartGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeaderRow}>
            <h3 className={styles.chartTitle}>{LABELS.groupTitle}</h3>
          </div>
          {busy ? (
            <ThreeDotsBlockLoader text={LABELS.loadingChart} minHeight={160} />
          ) : (
            <HorizontalBarList
              items={toItems(data?.by_group ?? {}, GROUP_LABELS)}
              formatValue={formatCount}
              emptyLabel={LABELS.empty}
            />
          )}
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeaderRow}>
            <h3 className={styles.chartTitle}>{LABELS.statusTitle}</h3>
          </div>
          {busy ? (
            <ThreeDotsBlockLoader text={LABELS.loadingChart} minHeight={160} />
          ) : (
            <HorizontalBarList
              items={toItems(data?.by_status ?? {}, STATUS_LABELS, STATUS_COLORS)}
              formatValue={formatCount}
              emptyLabel={LABELS.empty}
            />
          )}
          {navigate && (
            <button type="button" className={styles.viewAllLink} onClick={() => navigate('feedback')}>
              {LABELS.detailLink}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
