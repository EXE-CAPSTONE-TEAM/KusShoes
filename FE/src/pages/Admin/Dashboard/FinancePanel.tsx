import React, { useEffect, useState } from 'react';
import { AdminApiError, adminDashboard } from '../../../api/adminClient';
import type { FinanceOverview } from '../../../types/admin';
import { FinanceTrendChart } from '../../../components/Admin/FinanceTrendChart';
import { ThreeDotsBlockLoader, ThreeDotsLoader } from '../../../components/Admin/ThreeDotsLoader';
import styles from './AdminDashboard.module.css';

interface FinancePanelProps {
  navigate?: (page: string) => void;
  /** Tăng giá trị này để tải lại dữ liệu (nút "Làm mới" của banner). */
  refreshKey?: number;
  /** Báo cho cha biết khi nào đang tải để khóa nút làm mới. */
  onLoadingChange?: (loading: boolean) => void;
}

const LABELS = {
  sectionTitle: 'Tổng quan tài chính',
  sectionSubtitle: 'Doanh thu, chi phí vận hành và lợi nhuận của KusShoes',
  revenue: 'Tổng doanh thu',
  profit: 'Tổng lợi nhuận',
  profitCaption: 'Doanh thu − chi phí API − chi phí duy trì; chưa gồm chi phí marketing (sổ 08)',
  maintenance: 'Chi phí duy trì website/API',
  maintenanceUnconfigured: 'Chưa cấu hình chi phí cố định',
  margin: 'Tỷ suất lợi nhuận biên',
  thisMonth: 'Tháng này',
  from: 'Từ',
  api: 'API',
  fixed: 'Cố định',
  perMonth: 'tháng',
  chartTitle: 'Xu hướng doanh thu & lợi nhuận',
  range1m: '1 tháng',
  range6m: '6 tháng',
  detailLink: 'Phân tích chi tiết →',
  unsupported: 'Máy chủ chưa hỗ trợ dữ liệu tài chính',
  loadError: 'Không tải được dữ liệu tài chính.',
  retry: 'Thử lại',
  loadingChart: 'Đang tải biểu đồ tài chính...',
  noValue: '—',
};

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatPercent = (rate: number | null) =>
  rate === null ? LABELS.noValue : `${(rate * 100).toFixed(1)}%`;
const formatIsoDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type Range = '1m' | '6m';

export const FinancePanel: React.FC<FinancePanelProps> = ({ navigate, refreshKey = 0, onLoadingChange }) => {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<'unsupported' | 'failed' | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('1m');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    onLoadingChange?.(true);
    adminDashboard
      .finance()
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const unsupported = err instanceof AdminApiError && (err.status === 404 || err.status === 405);
        setError(unsupported ? 'unsupported' : 'failed');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        onLoadingChange?.(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, retryKey, onLoadingChange]);

  const cardValue = (value: string | null | undefined) =>
    loading && !data ? <ThreeDotsLoader size="md" /> : (value ?? LABELS.noValue);

  const maintenanceCaption = data
    ? data.maintenance.configured && data.maintenance.monthly_vnd !== null
      ? `${LABELS.api}: ${formatVnd(data.current_month.api_cost_vnd)} · ${LABELS.fixed}: ${formatVnd(data.maintenance.monthly_vnd)}/${LABELS.perMonth}`
      : `${LABELS.api}: ${formatVnd(data.current_month.api_cost_vnd)} · ${LABELS.maintenanceUnconfigured}`
    : '';

  const points = data ? (range === '1m' ? data.series_1m : data.series_6m) : [];

  return (
    <div className={styles.sectionWrapper}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>{LABELS.sectionTitle}</h2>
        </div>
        <span className={styles.sectionSubtitle}>{LABELS.sectionSubtitle}</span>
      </div>

      {error === 'unsupported' && <div role="alert">{LABELS.unsupported}</div>}
      {error === 'failed' && (
        <div role="alert">
          {LABELS.loadError}{' '}
          <button type="button" className={styles.bannerBtn} onClick={() => setRetryKey((k) => k + 1)}>
            <span>{LABELS.retry}</span>
          </button>
        </div>
      )}

      {error !== 'unsupported' && (
        <>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiLabel}>{LABELS.revenue}</span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{cardValue(data && formatVnd(data.totals.revenue_vnd))}</span>
              </div>
              <span className={styles.kpiCaption}>
                {data
                  ? `${data.since ? `${LABELS.from} ${formatIsoDate(data.since)} · ` : ''}${LABELS.thisMonth}: ${formatVnd(data.current_month.revenue_vnd)}`
                  : ''}
              </span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiLabel}>{LABELS.profit}</span>
              </div>
              <div className={styles.kpiValueRow}>
                <span
                  className={styles.kpiValue}
                  style={data && data.totals.profit_vnd < 0 ? { color: 'var(--color-crimson)' } : undefined}
                >
                  {cardValue(data && formatVnd(data.totals.profit_vnd))}
                </span>
              </div>
              <span className={styles.kpiCaption}>{LABELS.profitCaption}</span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiLabel}>{LABELS.maintenance}</span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>
                  {cardValue(data && formatVnd(data.current_month.total_cost_vnd))}
                </span>
              </div>
              <span className={styles.kpiCaption}>{maintenanceCaption}</span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiLabel}>{LABELS.margin}</span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>
                  {cardValue(data && formatPercent(data.totals.contribution_margin_rate))}
                </span>
              </div>
              <span className={styles.kpiCaption}>
                {data ? `${LABELS.thisMonth}: ${formatPercent(data.current_month.contribution_margin_rate)}` : ''}
              </span>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHeaderRow}>
              <h3 className={styles.chartTitle}>{LABELS.chartTitle}</h3>
              <div className={styles.chartToggle}>
                <button
                  type="button"
                  className={`${styles.chartToggleBtn} ${range === '1m' ? styles.chartToggleBtnActive : ''}`}
                  aria-pressed={range === '1m'}
                  onClick={() => setRange('1m')}
                >
                  {LABELS.range1m}
                </button>
                <button
                  type="button"
                  className={`${styles.chartToggleBtn} ${range === '6m' ? styles.chartToggleBtnActive : ''}`}
                  aria-pressed={range === '6m'}
                  onClick={() => setRange('6m')}
                >
                  {LABELS.range6m}
                </button>
              </div>
            </div>
            {loading && !data ? (
              <ThreeDotsBlockLoader text={LABELS.loadingChart} minHeight={240} />
            ) : (
              <FinanceTrendChart points={points} granularity={range === '1m' ? 'day' : 'month'} height={320} />
            )}
            {navigate && (
              <button type="button" className={styles.viewAllLink} onClick={() => navigate('analytics')}>
                {LABELS.detailLink}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
