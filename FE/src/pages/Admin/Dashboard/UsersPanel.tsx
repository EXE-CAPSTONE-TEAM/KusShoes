import React, { useEffect, useState } from 'react';
import { adminDashboard } from '../../../api/adminClient';
import type { DashboardStats, MonthlyPoint, RecentUser } from '../../../types/admin';
import { MiniBarChart } from '../../../components/Admin/MiniBarChart';
import { ThreeDotsBlockLoader, ThreeDotsLoader } from '../../../components/Admin/ThreeDotsLoader';
import styles from './AdminDashboard.module.css';

interface UsersPanelProps {
  navigate?: (page: string) => void;
  /** Tăng giá trị này để tải lại dữ liệu (nút "Làm mới" của banner). */
  refreshKey?: number;
}

const LABELS = {
  sectionTitle: 'Người dùng',
  sectionSubtitle: 'Quy mô, tốc độ tăng trưởng và mức độ sử dụng studio',
  totalUsers: 'Tổng người dùng',
  totalUsersCaption: 'Tất cả tài khoản đã đăng ký',
  newThisMonth: 'Mới tháng này',
  avgNewPerMonth: 'Bình quân mới / tháng',
  totalExports: 'Lượt xuất mô hình',
  exportsCaption: 'Tổng số lần xuất file 3D (GLB / OBJ / ZIP)',
  growthTitle: 'Người dùng mới theo tháng',
  growthUnit: '(Đơn vị: người dùng)',
  recentTitle: 'Người dùng mới nhất',
  recentEmpty: 'Chưa có người dùng.',
  noPrevious: 'Chưa có dữ liệu tháng trước',
  vsPrevious: 'so với tháng trước',
  detailLink: 'Quản lý người dùng →',
  loadError: 'Không tải được dữ liệu người dùng.',
  retry: 'Thử lại',
  loadingChart: 'Đang tải dữ liệu người dùng...',
  noValue: '—',
};

// Số tháng của biểu đồ tăng trưởng; cũng là mẫu để tính bình quân người dùng mới / tháng.
const GROWTH_MONTHS = 6;
const RECENT_LIMIT = 5;

const formatCount = (v: number) => v.toLocaleString('vi-VN');
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

const deltaCaption = (current: number, previous: number): string => {
  if (previous === 0) return LABELS.noPrevious;
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% ${LABELS.vsPrevious}`;
};

export const UsersPanel: React.FC<UsersPanelProps> = ({ navigate, refreshKey = 0 }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [growth, setGrowth] = useState<MonthlyPoint[]>([]);
  const [recent, setRecent] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      adminDashboard.stats(),
      adminDashboard.userGrowth(GROWTH_MONTHS),
      adminDashboard.recentUsers(RECENT_LIMIT),
    ])
      .then(([s, g, r]) => {
        if (!active) return;
        setStats(s);
        setGrowth(g);
        setRecent(r);
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

  const current = growth.length > 0 ? growth[growth.length - 1].value : 0;
  const previous = growth.length > 1 ? growth[growth.length - 2].value : 0;
  const average = growth.length > 0 ? growth.reduce((sum, p) => sum + p.value, 0) / growth.length : 0;
  const busy = loading && !stats;
  const value = (v: string | null) => (busy ? <ThreeDotsLoader size="md" /> : (v ?? LABELS.noValue));

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
            <span className={styles.kpiLabel}>{LABELS.totalUsers}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(stats && formatCount(stats.total_users))}</span>
          </div>
          <span className={styles.kpiCaption}>{LABELS.totalUsersCaption}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.newThisMonth}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(stats && formatCount(current))}</span>
          </div>
          <span className={styles.kpiCaption}>{stats ? deltaCaption(current, previous) : ''}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.avgNewPerMonth}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(stats && average.toFixed(1))}</span>
          </div>
          <span className={styles.kpiCaption}>{`Trung bình ${GROWTH_MONTHS} tháng gần nhất`}</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>{LABELS.totalExports}</span>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{value(stats && formatCount(stats.total_exports))}</span>
          </div>
          <span className={styles.kpiCaption}>{LABELS.exportsCaption}</span>
        </div>
      </div>

      <div className={styles.chartGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeaderRow}>
            <h3 className={styles.chartTitle}>{LABELS.growthTitle}</h3>
          </div>
          {busy ? (
            <ThreeDotsBlockLoader text={LABELS.loadingChart} minHeight={200} />
          ) : (
            <MiniBarChart
              points={growth.map((p) => ({ label: monthLabel(p.month), value: p.value }))}
              unitLabel={LABELS.growthUnit}
              color="var(--fin-blue)"
              height={220}
            />
          )}
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeaderRow}>
            <h3 className={styles.chartTitle}>{LABELS.recentTitle}</h3>
          </div>
          {busy ? (
            <ThreeDotsBlockLoader text={LABELS.loadingChart} minHeight={200} />
          ) : recent.length === 0 ? (
            <div className={styles.emptyNote}>{LABELS.recentEmpty}</div>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((u) => (
                <li key={u.id} className={styles.recentItem}>
                  <div className={styles.recentInfo}>
                    <span className={styles.recentName} title={u.email}>
                      {u.email}
                    </span>
                    <span className={styles.recentMeta}>{formatDate(u.created_at)}</span>
                  </div>
                  <span className={styles.planTag}>{u.plan_tier}</span>
                </li>
              ))}
            </ul>
          )}
          {navigate && (
            <button type="button" className={styles.viewAllLink} onClick={() => navigate('users')}>
              {LABELS.detailLink}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
