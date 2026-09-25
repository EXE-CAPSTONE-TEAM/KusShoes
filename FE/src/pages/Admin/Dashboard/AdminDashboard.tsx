import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  adminDashboard,
  adminSystem,
  adminAuditLogs,
  adminBilling,
  adminModeration,
  adminFeedback,
  adminApiCost,
} from '../../../api/adminClient';
import type {
  DashboardStats,
  MonthlyPoint,
  RecentUser,
  SystemHealth,
  AdminAuditLog,
  BakeJobStatus,
  AdminApiBudget,
} from '../../../types/admin';
import { MiniBarChart } from '../../../components/Admin/MiniBarChart';
import { MrrAreaChart } from '../../../components/Admin/MrrAreaChart';
import { ThreeDotsLoader, ThreeDotsBlockLoader } from '../../../components/Admin/ThreeDotsLoader';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { DashboardMetricModal, type DashboardMetricKey } from './DashboardMetricModal';
import shared from '../admin-shared.module.css';
import styles from './AdminDashboard.module.css';

interface AdminDashboardProps {
  navigate?: (page: string) => void;
}

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatMonth = (iso: string) => `T${new Date(iso).getMonth() + 1}`;

const PLAN_TIER_LABEL: Record<string, string> = {
  free: 'Free',
  basic_monthly: 'Basic · Tháng',
  basic_yearly: 'Basic · Năm',
  pro_monthly: 'Pro · Tháng',
  pro_yearly: 'Pro · Năm',
};

const AVATAR_CLASSES = [
  styles.avatarA,
  styles.avatarB,
  styles.avatarC,
  styles.avatarD,
  styles.avatarE,
];

const BAKE_STATUS_COLOR: Record<BakeJobStatus, string> = {
  completed: 'var(--status-scanned)',
  processing: 'var(--status-completed)',
  queued: 'var(--status-designing)',
  failed: 'var(--color-crimson)',
  cancelled: 'var(--text-muted)',
};

const BAKE_STATUS_LABEL: Record<BakeJobStatus, string> = {
  completed: 'Hoàn tất',
  processing: 'Đang xử lý',
  queued: 'Trong hàng đợi',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

const ACTION_META: Record<
  string,
  { tag: string; label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }
> = {
  'user.ban': { tag: 'BAN', label: 'Khóa tài khoản người dùng', tone: 'danger' },
  'user.unban': { tag: 'UNBAN', label: 'Mở khóa tài khoản', tone: 'ok' },
  'staff.create': { tag: 'STAFF', label: 'Tạo tài khoản nhân viên', tone: 'info' },
  'plan.update': { tag: 'PLAN', label: 'Cập nhật gói cước', tone: 'info' },
  'project.delete': { tag: 'DELETE', label: 'Xóa project', tone: 'danger' },
  'bake_job.requeue': { tag: 'REQUEUE', label: 'Xếp lại hàng đợi bake job', tone: 'warn' },
  'bake_job.cancel': { tag: 'CANCEL', label: 'Hủy bake job', tone: 'warn' },
  'bake_job.completed': { tag: 'BAKE OK', label: 'Hoàn tất bake job', tone: 'ok' },
  'bake_job.failed': { tag: 'BAKE FAIL', label: 'Bake job thất bại', tone: 'danger' },
  'bake_job.queued': { tag: 'QUEUED', label: 'Bake job vào hàng đợi', tone: 'muted' },
  'bake_job.processing': { tag: 'RUNNING', label: 'Đang xử lý bake job', tone: 'info' },
  'bake_job.cancelled': { tag: 'CANCELLED', label: 'Bake job đã hủy', tone: 'muted' },
  'subscription.force_downgrade': { tag: 'DOWNGRADE', label: 'Hạ cấp gói bắt buộc', tone: 'warn' },
  'invoice.refund': { tag: 'REFUND', label: 'Hoàn tiền hóa đơn', tone: 'info' },
};

const getActionMeta = (action: string) =>
  ACTION_META[action] ?? { tag: 'LOG', label: action, tone: 'muted' as const };

const TONE_VAR: Record<'ok' | 'warn' | 'danger' | 'info' | 'muted', string> = {
  ok: 'var(--status-scanned)',
  danger: 'var(--color-crimson)',
  warn: 'var(--status-designing)',
  info: 'var(--status-completed)',
  muted: 'var(--text-muted)',
};

const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
};

const computeTrend = (points: MonthlyPoint[]): { pct: number; up: boolean } | null => {
  if (points.length < 3) return null;
  const last = points[points.length - 2].value;
  const prev = points[points.length - 3].value;
  if (prev === 0) return null;
  const pct = ((last - prev) / prev) * 100;
  return { pct, up: pct >= 0 };
};

const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;

type ActionTone = 'ok' | 'warn' | 'danger' | 'neutral';

const ACTION_TONE_COLOR: Record<ActionTone, string> = {
  ok: 'var(--status-scanned)',
  warn: 'var(--status-designing)',
  danger: 'var(--color-crimson)',
  neutral: 'var(--text-muted)',
};

interface CountResult {
  count: number;
  hasMore: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ navigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [userGrowth, setUserGrowth] = useState<MonthlyPoint[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [activity, setActivity] = useState<AdminAuditLog[]>([]);
  const [revenue, setRevenue] = useState<MonthlyPoint[]>([]);
  const [revenueMonths, setRevenueMonths] = useState<6 | 12>(12);

  const [loading, setLoading] = useState(true);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricKey | null>(null);

  // Khu vực "Cần xử lý" — các đầu việc vận hành thực tế đang chờ admin, không trùng lặp với Analytics
  const [actionLoading, setActionLoading] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<CountResult>({ count: 0, hasMore: false });
  const [newReports, setNewReports] = useState<CountResult>({ count: 0, hasMore: false });
  const [newFeedback, setNewFeedback] = useState(0);
  const [apiBudget, setApiBudget] = useState<AdminApiBudget | null>(null);

  const loadCore = useCallback(
    () =>
      Promise.all([
        adminDashboard.stats().then(setStats),
        adminDashboard.userGrowth(6).then(setUserGrowth),
        adminDashboard.recentUsers(5).then(setRecentUsers),
        adminSystem.health().then(setHealth),
        adminAuditLogs.list({ limit: 6 }).then((page) => setActivity(page.items)),
      ]),
    [],
  );

  const loadActionCenter = useCallback(
    () =>
      Promise.all([
        adminBilling
          .invoices({ status: 'awaiting_approval', limit: 50 })
          .then((page) =>
            setPendingInvoices({ count: page.items.length, hasMore: !!page.next_cursor }),
          )
          .catch(() => {}),
        adminModeration
          .listReports({ status: 'new', limit: 50 })
          .then((page) => setNewReports({ count: page.items.length, hasMore: !!page.next_cursor }))
          .catch(() => {}),
        adminFeedback
          .summary()
          .then((s) => setNewFeedback(s.by_status['new'] ?? 0))
          .catch(() => {}),
        adminApiCost
          .budget()
          .then(setApiBudget)
          .catch(() => {}),
      ]),
    [],
  );

  const loadRevenue = useCallback((months: number) => {
    setRevenueLoading(true);
    return adminDashboard
      .revenue(months)
      .then(setRevenue)
      .finally(() => setRevenueLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCore().finally(() => setLoading(false));
    setActionLoading(true);
    loadActionCenter().finally(() => setActionLoading(false));
  }, [loadCore, loadActionCenter]);

  useEffect(() => {
    loadRevenue(revenueMonths);
  }, [revenueMonths, loadRevenue]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadCore(), loadRevenue(revenueMonths), loadActionCenter()]).finally(() =>
      setRefreshing(false),
    );
  };

  const handleExportReport = () => {
    if (!stats) return;
    const rows: string[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Tổng người dùng', String(stats.total_users)],
      ['Doanh thu MRR (VNĐ)', String(stats.mrr_vnd)],
      ['Tổng lượt export', String(stats.total_exports)],
      [],
      ['Người dùng mới gần đây'],
      ['Email', 'Username', 'Gói', 'Trạng thái', 'MRR (VNĐ)', 'Ngày tạo'],
      ...recentUsers.map((u) => [
        u.email,
        u.username,
        PLAN_TIER_LABEL[u.plan_tier] ?? u.plan_tier,
        u.status,
        String(u.mrr_vnd),
        new Date(u.created_at).toLocaleDateString('vi-VN'),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => csvEscape(String(cell ?? ''))).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kusshoes-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userGrowthTrend = useMemo(() => computeTrend(userGrowth), [userGrowth]);
  const revenueTrend = useMemo(() => computeTrend(revenue), [revenue]);

  const actionItems = useMemo(() => {
    const budgetPercent = apiBudget?.percent ?? null;
    const budgetTone: ActionTone =
      apiBudget?.state === 'suspended'
        ? 'danger'
        : apiBudget?.state === 'warning'
          ? 'warn'
          : apiBudget?.state === 'ok'
            ? 'ok'
            : 'neutral';

    return [
      {
        key: 'pending-invoices',
        label: 'Hóa đơn chờ duyệt thủ công',
        value: `${pendingInvoices.count}${pendingInvoices.hasMore ? '+' : ''}`,
        caption: 'Chuyển khoản thủ công đang chờ admin xác nhận đối soát',
        tone: (pendingInvoices.count > 0 ? 'warn' : 'ok') as ActionTone,
        onClick: () => navigate?.('billing'),
      },
      {
        key: 'content-reports',
        label: 'Báo cáo vi phạm mới',
        value: `${newReports.count}${newReports.hasMore ? '+' : ''}`,
        caption: 'Nội dung bị người dùng báo cáo, chưa được kiểm duyệt',
        tone: (newReports.count > 0 ? 'danger' : 'ok') as ActionTone,
        onClick: () => navigate?.('content'),
      },
      {
        key: 'new-feedback',
        label: 'Phản hồi chưa xử lý',
        value: `${newFeedback}`,
        caption: 'Đánh giá & góp ý của người dùng đang chờ phản hồi',
        tone: (newFeedback > 0 ? 'warn' : 'ok') as ActionTone,
        onClick: () => navigate?.('feedback'),
      },
      {
        key: 'api-budget',
        label: 'Ngân sách API tháng này',
        value:
          apiBudget?.state === 'unconfigured' || budgetPercent === null
            ? 'Chưa cấu hình'
            : `${budgetPercent.toFixed(0)}%`,
        caption:
          apiBudget && apiBudget.state !== 'unconfigured'
            ? `Đã dùng ${formatVnd(apiBudget.spent_vnd)}${apiBudget.budget_vnd ? ` / ${formatVnd(apiBudget.budget_vnd)}` : ''}`
            : 'Chưa thiết lập hạn mức chi phí API 3D/AI cho tháng hiện tại',
        tone: budgetTone,
        onClick: () => navigate?.('billing'),
      },
    ];
  }, [pendingInvoices, newReports, newFeedback, apiBudget, navigate]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return recentUsers;
    return recentUsers.filter(
      (u) => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    );
  }, [recentUsers, userSearch]);

  const bakeTotal = health
    ? Object.values(health.bake_jobs_by_status).reduce((a, b) => a + b, 0)
    : 0;
  const bakeActive = health
    ? (health.bake_jobs_by_status.queued ?? 0) + (health.bake_jobs_by_status.processing ?? 0)
    : 0;
  const queueDepthTotal = health
    ? (health.queue_depths.high ?? 0) +
      (health.queue_depths.normal ?? 0) +
      (health.queue_depths.low ?? 0)
    : 0;

  return (
    <div className={shared.page}>
      <div className={styles.container}>
        {/* Banner tiêu đề đồng bộ Sidebar */}
        <div className={styles.banner}>
          <div className={styles.bannerLeft}>
            <div className={styles.bannerTitleRow}>
              <h1 className={styles.bannerTitle}>Tổng quan hệ thống KusShoes</h1>
              <span className={styles.liveBadge}>
                <span className={styles.liveDot} />
                Live Sync
              </span>
            </div>
            <p className={styles.bannerSubtitle}>
              Theo dõi sức khỏe kinh doanh, tăng trưởng người dùng và các đầu việc vận hành cần xử
              lý trong ngày.
            </p>
          </div>

          <div className={styles.bannerActions}>
            <button className={styles.bannerBtn} onClick={handleExportReport} disabled={!stats}>
              <span>Xuất báo cáo</span>
            </button>
            <button className={styles.bannerBtn} onClick={handleRefresh} disabled={refreshing}>
              <span>{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
            {navigate && (
              <button className={styles.bannerBtn} onClick={() => navigate('users')}>
                <span>Quản lý người dùng</span>
              </button>
            )}
          </div>
        </div>

        {/* KHU VỰC CẦN XỬ LÝ — các đầu việc vận hành thực tế đang chờ admin xác nhận/duyệt */}
        <div className={styles.sectionWrapper}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>Cần xử lý</h2>
            </div>
            <span className={styles.sectionSubtitle}>
              Các hạng mục vận hành đang chờ admin xác nhận, kiểm duyệt hoặc phê duyệt
            </span>
          </div>
          <div className={styles.actionGrid}>
            {actionItems.map((item) => (
              <div
                key={item.key}
                className={styles.actionCard}
                style={{ '--tone-color': ACTION_TONE_COLOR[item.tone] } as React.CSSProperties}
                onClick={item.onClick}
                role="button"
                tabIndex={0}
                title="Bấm để đi đến trang xử lý"
              >
                <div className={styles.actionHeader}>
                  <span className={styles.actionLabel}>{item.label}</span>
                  <span className={styles.actionDot} />
                </div>
                <span className={styles.actionValue}>
                  {actionLoading ? <ThreeDotsLoader size="md" /> : item.value}
                </span>
                <span className={styles.actionCaption}>{item.caption}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4 HERO KPI CARDS */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Tổng người dùng */}
          <div
            className={styles.kpiCard}
            onClick={() => setSelectedMetric('total_users')}
            role="button"
            tabIndex={0}
            title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
          >
            <div className={styles.kpiCardHeader}>
              <span className={styles.kpiLabel}>Tổng người dùng</span>
              <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>
                {loading ? (
                  <ThreeDotsLoader size="md" />
                ) : (
                  stats?.total_users.toLocaleString('vi-VN')
                )}
              </span>
              {userGrowthTrend && (
                <span
                  className={`${styles.trendChip} ${userGrowthTrend.up ? styles.trendUp : styles.trendDown}`}
                >
                  {userGrowthTrend.up ? '▲' : '▼'} {userGrowthTrend.pct >= 0 ? '+' : ''}
                  {userGrowthTrend.pct.toFixed(1)}%
                </span>
              )}
            </div>
            <span className={styles.kpiCaption}>
              So với tháng trước · Tính trên dữ liệu 6 tháng gần nhất
            </span>
          </div>

          {/* Card 2: Doanh thu định kỳ (MRR) */}
          <div
            className={styles.kpiCard}
            onClick={() => setSelectedMetric('mrr')}
            role="button"
            tabIndex={0}
            title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
          >
            <div className={styles.kpiCardHeader}>
              <span className={styles.kpiLabel}>Doanh thu định kỳ (MRR)</span>
              <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>
                {loading ? <ThreeDotsLoader size="md" /> : formatVnd(stats?.mrr_vnd ?? 0)}
              </span>
              {revenueTrend && (
                <span
                  className={`${styles.trendChip} ${revenueTrend.up ? styles.trendUp : styles.trendDown}`}
                >
                  {revenueTrend.up ? '▲' : '▼'} {revenueTrend.pct >= 0 ? '+' : ''}
                  {revenueTrend.pct.toFixed(1)}%
                </span>
              )}
            </div>
            <span className={styles.kpiCaption}>
              ARR dự phóng: ~
              {loading ? <ThreeDotsLoader size="sm" /> : formatVnd((stats?.mrr_vnd ?? 0) * 12)}
            </span>
          </div>

          {/* Card 3: Tổng lượt Export 3D */}
          <div
            className={styles.kpiCard}
            onClick={() => setSelectedMetric('total_exports')}
            role="button"
            tabIndex={0}
            title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
          >
            <div className={styles.kpiCardHeader}>
              <span className={styles.kpiLabel}>Tổng lượt Export 3D</span>
              <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>
                {loading ? (
                  <ThreeDotsLoader size="md" />
                ) : (
                  stats?.total_exports.toLocaleString('vi-VN')
                )}
              </span>
            </div>
            <span className={styles.kpiCaption}>
              Định dạng mô hình hỗ trợ: GLB · OBJ · ZIP textures
            </span>
          </div>

          {/* Card 4: Bake Job Pipeline */}
          <div
            className={styles.kpiCard}
            onClick={() => setSelectedMetric('bake_pipeline')}
            role="button"
            tabIndex={0}
            title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
          >
            <div className={styles.kpiCardHeader}>
              <span className={styles.kpiLabel}>Bake Job Pipeline</span>
              <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>
                {loading || !health ? (
                  <ThreeDotsLoader size="md" />
                ) : (
                  bakeTotal.toLocaleString('vi-VN')
                )}
              </span>
              {health && (
                <StatusBadge
                  status={health.status}
                  tone={health.status === 'ok' ? 'ok' : 'warn'}
                  label={health.status === 'ok' ? 'Ổn định' : 'Degraded'}
                />
              )}
            </div>
            {health && bakeTotal > 0 && (
              <div className={styles.stackedBar}>
                {(Object.keys(health.bake_jobs_by_status) as BakeJobStatus[]).map((status) => {
                  const count = health.bake_jobs_by_status[status] ?? 0;
                  if (!count) return null;
                  return (
                    <div
                      key={status}
                      className={styles.stackedBarSegment}
                      style={{
                        width: `${(count / bakeTotal) * 100}%`,
                        backgroundColor: BAKE_STATUS_COLOR[status],
                      }}
                      title={`${BAKE_STATUS_LABEL[status]}: ${count}`}
                    />
                  );
                })}
              </div>
            )}
            <span className={styles.kpiCaption}>
              {bakeActive} job đang xử lý/hàng đợi · {queueDepthTotal} job chờ live
            </span>
          </div>
        </div>

        {/* SECTION: BIỂU ĐỒ PHÂN TÍCH DOANH THU & TĂNG TRƯỞNG */}
        <div className={styles.sectionWrapper}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>Biểu đồ phân tích dòng tiền &amp; tăng trưởng</h2>
            </div>
            <span className={styles.sectionSubtitle}>
              Theo dõi biến động doanh thu theo chu kỳ tháng và tốc độ mở rộng tập khách hàng
            </span>
          </div>

          <div className={styles.chartsGrid}>
            {/* Doanh thu theo tháng */}
            <div
              className={`${styles.chartCard} ${styles.clickableChartCard}`}
              onClick={() => setSelectedMetric('revenue_chart')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.chartHeaderRow}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className={styles.chartTitle}>Doanh thu theo tháng</h3>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <p className={styles.chartSubtitle}>
                    Doanh thu định kỳ MRR (VNĐ) theo từng tháng phát sinh
                  </p>
                </div>
                <div className={styles.chartToggle} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`${styles.chartToggleBtn} ${revenueMonths === 6 ? styles.chartToggleBtnActive : ''}`}
                    onClick={() => setRevenueMonths(6)}
                  >
                    6 tháng
                  </button>
                  <button
                    className={`${styles.chartToggleBtn} ${revenueMonths === 12 ? styles.chartToggleBtnActive : ''}`}
                    onClick={() => setRevenueMonths(12)}
                  >
                    12 tháng
                  </button>
                </div>
              </div>
              {revenueLoading ? (
                <ThreeDotsBlockLoader text="Đang tải dữ liệu chuỗi doanh thu..." minHeight={180} />
              ) : (
                <MrrAreaChart
                  points={revenue.map((p) => ({ label: formatMonth(p.month), value: p.value }))}
                  formatValue={formatVnd}
                  color="var(--color-orange)"
                  gradientId="dashRevenueGradient"
                  height={210}
                />
              )}
            </div>

            {/* Tăng trưởng người dùng */}
            <div
              className={`${styles.chartCard} ${styles.clickableChartCard}`}
              onClick={() => setSelectedMetric('user_growth_chart')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.chartHeaderRow}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className={styles.chartTitle}>Tăng trưởng người dùng</h3>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <p className={styles.chartSubtitle}>
                    Người dùng mới đăng ký theo tháng (6 tháng gần nhất)
                  </p>
                </div>
              </div>
              {loading ? (
                <ThreeDotsBlockLoader
                  text="Đang tải dữ liệu tăng trưởng người dùng..."
                  minHeight={180}
                />
              ) : (
                <MiniBarChart
                  points={userGrowth.map((p) => ({ label: formatMonth(p.month), value: p.value }))}
                  formatValue={(v) => `${v.toLocaleString('vi-VN')} người dùng`}
                  formatTick={(v) => v.toLocaleString('vi-VN')}
                  unitLabel="(Đơn vị: Người dùng mới)"
                  color="var(--status-completed)"
                  height={200}
                />
              )}
            </div>
          </div>
        </div>

        {/* SECTION: BẢNG NGƯỜI DÙNG MỚI GẦN ĐÂY */}
        <div className={styles.usersCard}>
          <div className={styles.tableToolbarRow}>
            <div className={styles.tableTitleGroup}>
              <h3 className={styles.chartTitle}>
                Người dùng mới gần đây
                <span className={styles.tableCountBadge}>{recentUsers.length}</span>
              </h3>
            </div>
            <div className={styles.searchBox}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Tìm email, username..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </div>

          <div className={shared.tableWrap}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Gói cước</th>
                  <th>Trạng thái</th>
                  <th>Doanh thu MRR</th>
                  <th>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div
                          className={`${styles.avatarCircle} ${AVATAR_CLASSES[i % AVATAR_CLASSES.length]}`}
                        >
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div className={styles.userCellText}>
                          <span className={styles.userCellEmail}>{u.email}</span>
                          <span className={styles.userCellUsername}>@{u.username}</span>
                        </div>
                      </div>
                    </td>
                    <td>{PLAN_TIER_LABEL[u.plan_tier] ?? u.plan_tier}</td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                    <td>{formatVnd(u.mrr_vnd)}</td>
                    <td className={shared.mutedCell}>
                      {new Date(u.created_at).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))}
                {!loading && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className={shared.emptyState}>Không tìm thấy người dùng phù hợp.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {navigate && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className={styles.viewAllLink} onClick={() => navigate('users')}>
                Xem tất cả người dùng trong hệ thống →
              </button>
            </div>
          )}
        </div>

        {/* SECTION: HOẠT ĐỘNG GẦN ĐÂY & TÀI NGUYÊN HỆ THỐNG */}
        <div className={styles.bottomSplit}>
          {/* Hoạt động gần đây */}
          <div className={styles.chartCard}>
            <div className={styles.chartHeaderRow}>
              <div>
                <h3 className={styles.chartTitle}>Hoạt động hệ thống gần đây</h3>
                <p className={styles.chartSubtitle}>
                  Nhật ký thao tác quản trị và tiến trình bake job mới nhất
                </p>
              </div>
              {navigate && (
                <button className={styles.viewAllLink} onClick={() => navigate('audit-logs')}>
                  Xem tất cả →
                </button>
              )}
            </div>
            <div className={styles.activityList}>
              {activity.map((log) => {
                const meta = getActionMeta(log.action);
                return (
                  <div key={log.id} className={styles.activityItem}>
                    <div className={styles.activityMain}>
                      <span
                        className={styles.activityTag}
                        style={{
                          color: TONE_VAR[meta.tone],
                          backgroundColor: `color-mix(in srgb, ${TONE_VAR[meta.tone]} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${TONE_VAR[meta.tone]} 30%, transparent)`,
                        }}
                      >
                        {meta.tag}
                      </span>
                      <div className={styles.activityTextCol}>
                        <span className={styles.activityTitle}>{meta.label}</span>
                        <span className={styles.activityMeta}>
                          {log.actor_email ?? 'Hệ thống'}
                          {log.target_type ? ` · ${log.target_type}` : ''}
                        </span>
                      </div>
                    </div>
                    <span className={styles.activityTime}>{timeAgo(log.created_at)}</span>
                  </div>
                );
              })}
              {!loading && activity.length === 0 && (
                <div className={shared.emptyState}>Chưa có hoạt động nào được ghi nhận.</div>
              )}
            </div>
          </div>

          {/* Tài nguyên hệ thống */}
          <div className={styles.chartCard}>
            <div>
              <h3 className={styles.chartTitle}>Tài nguyên hệ thống</h3>
              <p className={styles.chartSubtitle}>Tình trạng hạ tầng KusShoes Core</p>
            </div>
            {health && (
              <>
                <div className={styles.healthChecksRow}>
                  {Object.entries(health.checks).map(([key, value]) => (
                    <div key={key} className={styles.healthCheckItem}>
                      <span className={styles.healthCheckLabel}>{key.toUpperCase()}</span>
                      <StatusBadge
                        status={value}
                        tone={value === 'ok' ? 'ok' : 'warn'}
                        label={value}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.healthDivider} />
                <div className={styles.healthMiniStat}>
                  <span>Hàng đợi ưu tiên cao (High)</span>
                  <span className={styles.healthMiniStatValue}>
                    {health.queue_depths.high ?? 0}
                  </span>
                </div>
                <div className={styles.healthMiniStat}>
                  <span>Hàng đợi thường (Normal)</span>
                  <span className={styles.healthMiniStatValue}>
                    {health.queue_depths.normal ?? 0}
                  </span>
                </div>
                <div className={styles.healthMiniStat}>
                  <span>Hàng đợi thấp (Low)</span>
                  <span className={styles.healthMiniStatValue}>{health.queue_depths.low ?? 0}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* MODAL CHI TIẾT CÁCH TÍNH & BÓC TÁCH NGUỒN LOG */}
        {selectedMetric && (
          <DashboardMetricModal
            metricKey={selectedMetric}
            stats={stats}
            userGrowth={userGrowth}
            revenue={revenue}
            revenueMonths={revenueMonths}
            health={health}
            onClose={() => setSelectedMetric(null)}
          />
        )}
      </div>
    </div>
  );
};
