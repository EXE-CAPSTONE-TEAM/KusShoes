import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, DollarSign, Download, Flame, Search, RefreshCw, FileDown, ArrowRight,
  TrendingUp, TrendingDown, Database, Layers, HardDrive, ShieldOff, ShieldCheck,
  UserPlus, Package, Trash2, RotateCw, XCircle, CheckCircle2, AlertTriangle,
  Clock, Loader2, ArrowDownCircle, Undo2, Activity,
} from 'lucide-react';
import { adminDashboard, adminSystem, adminAuditLogs } from '../../../api/adminClient';
import type { DashboardStats, MonthlyPoint, RecentUser, SystemHealth, AdminAuditLog, BakeJobStatus } from '../../../types/admin';
import { MiniBarChart } from '../../../components/Admin/MiniBarChart';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
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

const AVATAR_CLASSES = [styles.avatarA, styles.avatarB, styles.avatarC, styles.avatarD, styles.avatarE];

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

const CHECK_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  db: Database,
  redis: Layers,
  storage: HardDrive,
};

const ACTION_META: Record<string, { icon: React.ComponentType<{ size?: number }>; label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }> = {
  'user.ban': { icon: ShieldOff, label: 'Khóa tài khoản người dùng', tone: 'danger' },
  'user.unban': { icon: ShieldCheck, label: 'Mở khóa tài khoản', tone: 'ok' },
  'staff.create': { icon: UserPlus, label: 'Tạo tài khoản nhân viên', tone: 'info' },
  'plan.update': { icon: Package, label: 'Cập nhật gói cước', tone: 'info' },
  'project.delete': { icon: Trash2, label: 'Xóa project', tone: 'danger' },
  'bake_job.requeue': { icon: RotateCw, label: 'Xếp lại hàng đợi bake job', tone: 'warn' },
  'bake_job.cancel': { icon: XCircle, label: 'Hủy bake job', tone: 'warn' },
  'bake_job.completed': { icon: CheckCircle2, label: 'Hoàn tất bake job', tone: 'ok' },
  'bake_job.failed': { icon: AlertTriangle, label: 'Bake job thất bại', tone: 'danger' },
  'bake_job.queued': { icon: Clock, label: 'Bake job vào hàng đợi', tone: 'muted' },
  'bake_job.processing': { icon: Loader2, label: 'Đang xử lý bake job', tone: 'info' },
  'bake_job.cancelled': { icon: XCircle, label: 'Bake job đã hủy', tone: 'muted' },
  'subscription.force_downgrade': { icon: ArrowDownCircle, label: 'Hạ cấp gói bắt buộc', tone: 'warn' },
  'invoice.refund': { icon: Undo2, label: 'Hoàn tiền hóa đơn', tone: 'info' },
};

const getActionMeta = (action: string) => ACTION_META[action] ?? { icon: Activity, label: action, tone: 'muted' as const };

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

  const loadCore = useCallback(() => Promise.all([
    adminDashboard.stats().then(setStats),
    adminDashboard.userGrowth(6).then(setUserGrowth),
    adminDashboard.recentUsers(5).then(setRecentUsers),
    adminSystem.health().then(setHealth),
    adminAuditLogs.list({ limit: 6 }).then(page => setActivity(page.items)),
  ]), []);

  const loadRevenue = useCallback((months: number) => {
    setRevenueLoading(true);
    return adminDashboard.revenue(months).then(setRevenue).finally(() => setRevenueLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCore().finally(() => setLoading(false));
  }, [loadCore]);

  useEffect(() => {
    loadRevenue(revenueMonths);
  }, [revenueMonths, loadRevenue]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadCore(), loadRevenue(revenueMonths)]).finally(() => setRefreshing(false));
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
      ...recentUsers.map(u => [
        u.email, u.username, PLAN_TIER_LABEL[u.plan_tier] ?? u.plan_tier, u.status,
        String(u.mrr_vnd), new Date(u.created_at).toLocaleDateString('vi-VN'),
      ]),
    ];
    const csv = rows.map(r => r.map(cell => csvEscape(String(cell ?? ''))).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kusshoes-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userGrowthTrend = useMemo(() => computeTrend(userGrowth), [userGrowth]);
  const revenueTrend = useMemo(() => computeTrend(revenue), [revenue]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return recentUsers;
    return recentUsers.filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [recentUsers, userSearch]);

  const bakeTotal = health ? Object.values(health.bake_jobs_by_status).reduce((a, b) => a + b, 0) : 0;
  const bakeActive = health ? (health.bake_jobs_by_status.queued ?? 0) + (health.bake_jobs_by_status.processing ?? 0) : 0;
  const queueDepthTotal = health ? (health.queue_depths.high ?? 0) + (health.queue_depths.normal ?? 0) + (health.queue_depths.low ?? 0) : 0;

  return (
    <div className={shared.page}>
      {/* Greeting & action banner */}
      <div className={`${styles.banner} glass-panel`}>
        <div className={styles.bannerLeft}>
          <div className={styles.bannerTitleRow}>
            <h1 className={styles.bannerTitle}>Tổng quan hệ thống KusShoes</h1>
            <span className={styles.liveBadge}><span className={styles.liveDot} />Live Sync</span>
          </div>
          <p className={styles.bannerSubtitle}>
            Theo dõi tăng trưởng người dùng, doanh thu định kỳ (MRR), lượt export 3D và tình trạng hạ tầng bake job theo thời gian thực.
          </p>
        </div>
        <div className={styles.bannerActions}>
          <button className={styles.bannerBtn} onClick={handleExportReport} disabled={!stats}>
            <FileDown size={16} />
            <span>Xuất báo cáo</span>
          </button>
          <button className={styles.bannerBtn} onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? styles.spinning : ''} />
            <span>Làm mới</span>
          </button>
          {navigate && (
            <button className={styles.bannerBtn} onClick={() => navigate('users')}>
              <Users size={16} />
              <span>Quản lý người dùng</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>Tổng người dùng</span>
            <div className={styles.kpiIconBox}><Users size={18} /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{loading ? '—' : stats?.total_users.toLocaleString('vi-VN')}</span>
            {userGrowthTrend && (
              <span className={`${styles.trendChip} ${userGrowthTrend.up ? styles.trendUp : styles.trendDown}`}>
                {userGrowthTrend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {userGrowthTrend.pct >= 0 ? '+' : ''}{userGrowthTrend.pct.toFixed(1)}%
              </span>
            )}
          </div>
          <span className={styles.kpiCaption}>So với tháng trước (dữ liệu 6 tháng gần nhất)</span>
        </div>

        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>Doanh thu định kỳ (MRR)</span>
            <div className={styles.kpiIconBox}><DollarSign size={18} /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{loading ? '—' : formatVnd(stats?.mrr_vnd ?? 0)}</span>
            {revenueTrend && (
              <span className={`${styles.trendChip} ${revenueTrend.up ? styles.trendUp : styles.trendDown}`}>
                {revenueTrend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {revenueTrend.pct >= 0 ? '+' : ''}{revenueTrend.pct.toFixed(1)}%
              </span>
            )}
          </div>
          <span className={styles.kpiCaption}>ARR dự phóng: ~{loading ? '—' : formatVnd((stats?.mrr_vnd ?? 0) * 12)}</span>
        </div>

        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>Tổng lượt Export 3D</span>
            <div className={styles.kpiIconBox}><Download size={18} /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{loading ? '—' : stats?.total_exports.toLocaleString('vi-VN')}</span>
          </div>
          <span className={styles.kpiCaption}>Định dạng hỗ trợ: GLB · OBJ · ZIP</span>
        </div>

        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiLabel}>Bake Job Pipeline</span>
            <div className={styles.kpiIconBox}><Flame size={18} /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{loading || !health ? '—' : bakeTotal.toLocaleString('vi-VN')}</span>
            {health && <StatusBadge status={health.status} tone={health.status === 'ok' ? 'ok' : 'warn'} label={health.status === 'ok' ? 'Ổn định' : 'Degraded'} />}
          </div>
          {health && bakeTotal > 0 && (
            <div className={styles.stackedBar}>
              {(Object.keys(health.bake_jobs_by_status) as BakeJobStatus[]).map(status => {
                const count = health.bake_jobs_by_status[status] ?? 0;
                if (!count) return null;
                return (
                  <div
                    key={status}
                    className={styles.stackedBarSegment}
                    style={{ width: `${(count / bakeTotal) * 100}%`, backgroundColor: BAKE_STATUS_COLOR[status] }}
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

      {/* Charts row */}
      <div className={shared.chartsGrid}>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={styles.chartHeaderRow}>
            <div>
              <div className={styles.chartHeaderTitleRow}>
                <span className={shared.chartTitle}>Doanh thu theo tháng</span>
              </div>
              <p className={styles.chartSubtitle}>Doanh thu định kỳ MRR (VNĐ) theo từng tháng phát sinh</p>
            </div>
            <div className={styles.chartToggle}>
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
          {!revenueLoading && (
            <MiniBarChart
              points={revenue.map(p => ({ label: formatMonth(p.month), value: p.value }))}
              formatValue={formatVnd}
              color="var(--color-orange)"
            />
          )}
        </div>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={styles.chartHeaderRow}>
            <div>
              <span className={shared.chartTitle}>Tăng trưởng người dùng</span>
              <p className={styles.chartSubtitle}>Người dùng mới đăng ký theo tháng (6 tháng gần nhất)</p>
            </div>
          </div>
          {!loading && (
            <MiniBarChart
              points={userGrowth.map(p => ({ label: formatMonth(p.month), value: p.value }))}
              color="var(--status-completed)"
            />
          )}
        </div>
      </div>

      {/* Recent users table */}
      <div className={`${shared.chartCard} glass-panel`}>
        <div className={styles.tableToolbarRow}>
          <div className={styles.tableTitleGroup}>
            <span className={shared.chartTitle}>
              Người dùng mới gần đây
              <span className={styles.tableCountBadge}>{recentUsers.length}</span>
            </span>
          </div>
          <div className={`${shared.searchWrapper} glass-panel`} style={{ minWidth: 220 }}>
            <Search size={15} className={shared.searchIcon} />
            <input
              className={shared.searchInput}
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
                      <div className={`${styles.avatarCircle} ${AVATAR_CLASSES[i % AVATAR_CLASSES.length]}`}>
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.userCellText}>
                        <span className={styles.userCellEmail}>{u.email}</span>
                        <span className={styles.userCellUsername}>@{u.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>{PLAN_TIER_LABEL[u.plan_tier] ?? u.plan_tier}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{formatVnd(u.mrr_vnd)}</td>
                  <td className={shared.mutedCell}>{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                </tr>
              ))}
              {!loading && filteredUsers.length === 0 && (
                <tr><td colSpan={5}><div className={shared.emptyState}>Không có người dùng phù hợp.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {navigate && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className={styles.viewAllLink} onClick={() => navigate('users')}>
              Xem tất cả người dùng <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom split: activity feed + system resources */}
      <div className={styles.bottomSplit}>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={styles.chartHeaderRow}>
            <div>
              <span className={shared.chartTitle}>Hoạt động hệ thống gần đây</span>
              <p className={styles.chartSubtitle}>Nhật ký thao tác quản trị và tiến trình bake job mới nhất</p>
            </div>
            {navigate && (
              <button className={styles.viewAllLink} onClick={() => navigate('audit-logs')}>
                Xem tất cả <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className={styles.activityList}>
            {activity.map(log => {
              const meta = getActionMeta(log.action);
              const Icon = meta.icon;
              return (
                <div key={log.id} className={styles.activityItem}>
                  <div className={styles.activityMain}>
                    <div
                      className={styles.activityIconBox}
                      style={{
                        backgroundColor: `color-mix(in srgb, ${TONE_VAR[meta.tone]} 15%, transparent)`,
                        color: TONE_VAR[meta.tone],
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className={styles.activityTextCol}>
                      <span className={styles.activityTitle}>{meta.label}</span>
                      <span className={styles.activityMeta}>
                        {log.actor_email ?? 'Hệ thống'}{log.target_type ? ` · ${log.target_type}` : ''}
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

        <div className={`${shared.chartCard} glass-panel`}>
          <span className={shared.chartTitle}>Tài nguyên hệ thống</span>
          <p className={styles.chartSubtitle}>Tình trạng hạ tầng KusShoes Core</p>
          {health && (
            <>
              <div className={styles.healthChecksRow}>
                {Object.entries(health.checks).map(([key, value]) => {
                  const Icon = CHECK_ICON[key] ?? Database;
                  return (
                    <div key={key} className={styles.healthCheckItem}>
                      <span className={styles.healthCheckLabel}><Icon size={15} />{key.toUpperCase()}</span>
                      <StatusBadge status={value} tone={value === 'ok' ? 'ok' : 'warn'} label={value} />
                    </div>
                  );
                })}
              </div>
              <div className={styles.healthDivider} />
              <div className={styles.healthMiniStat}>
                <span>Hàng đợi Cao</span>
                <span className={styles.healthMiniStatValue}>{health.queue_depths.high ?? 0}</span>
              </div>
              <div className={styles.healthMiniStat}>
                <span>Hàng đợi Thường</span>
                <span className={styles.healthMiniStatValue}>{health.queue_depths.normal ?? 0}</span>
              </div>
              <div className={styles.healthMiniStat}>
                <span>Hàng đợi Thấp</span>
                <span className={styles.healthMiniStatValue}>{health.queue_depths.low ?? 0}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
