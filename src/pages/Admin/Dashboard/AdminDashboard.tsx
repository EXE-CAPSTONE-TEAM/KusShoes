import React, { useEffect, useState } from 'react';
import { Users, DollarSign, Download } from 'lucide-react';
import { adminDashboard } from '../../../api/adminClient';
import type { DashboardStats, MonthlyPoint, RecentUser } from '../../../types/admin';
import { MiniBarChart } from '../../../components/Admin/MiniBarChart';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import shared from '../admin-shared.module.css';

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatMonth = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short' });
};

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenue, setRevenue] = useState<MonthlyPoint[]>([]);
  const [userGrowth, setUserGrowth] = useState<MonthlyPoint[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      adminDashboard.stats(),
      adminDashboard.revenue(12),
      adminDashboard.userGrowth(6),
      adminDashboard.recentUsers(5),
    ]).then(([s, r, g, u]) => {
      if (!mounted) return;
      setStats(s);
      setRevenue(r);
      setUserGrowth(g);
      setRecentUsers(u);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Dashboard</h1>
          <p className={shared.pageSubtitle}>Tổng quan hệ thống KusShoes: người dùng, doanh thu, và export.</p>
        </div>
      </div>

      <div className={shared.statsGrid}>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}><Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Tổng người dùng</span>
          <span className={shared.statValue}>{loading ? '—' : stats?.total_users.toLocaleString('vi-VN')}</span>
        </div>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}><DollarSign size={14} style={{ verticalAlign: -2, marginRight: 6 }} />MRR</span>
          <span className={shared.statValue}>{loading ? '—' : formatVnd(stats?.mrr_vnd ?? 0)}</span>
        </div>
        <div className={`${shared.statCard} glass-panel`}>
          <span className={shared.statLabel}><Download size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Tổng export</span>
          <span className={shared.statValue}>{loading ? '—' : stats?.total_exports.toLocaleString('vi-VN')}</span>
        </div>
      </div>

      <div className={shared.chartsGrid}>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}>
            <span className={shared.chartTitle}>Doanh thu 12 tháng</span>
          </div>
          {!loading && (
            <MiniBarChart
              points={revenue.map(p => ({ label: formatMonth(p.month), value: p.value }))}
              formatValue={formatVnd}
              color="var(--color-orange)"
            />
          )}
        </div>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}>
            <span className={shared.chartTitle}>Tăng trưởng người dùng</span>
          </div>
          {!loading && (
            <MiniBarChart
              points={userGrowth.map(p => ({ label: formatMonth(p.month), value: p.value }))}
              color="var(--status-completed)"
            />
          )}
        </div>
      </div>

      <div className={`${shared.chartCard} glass-panel`}>
        <div className={shared.chartHeader}>
          <span className={shared.chartTitle}>Người dùng mới gần đây</span>
        </div>
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Gói</th>
                <th>Trạng thái</th>
                <th>MRR</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td className={shared.mutedCell}>{u.username}</td>
                  <td>{u.plan_tier}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{formatVnd(u.mrr_vnd)}</td>
                  <td className={shared.mutedCell}>{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                </tr>
              ))}
              {!loading && recentUsers.length === 0 && (
                <tr><td colSpan={6}><div className={shared.emptyState}>Không có người dùng mới.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
