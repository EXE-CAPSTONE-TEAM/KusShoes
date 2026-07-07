import React, { useCallback } from 'react';
import { Database, Layers, HardDrive, RotateCw } from 'lucide-react';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import { adminSystem } from '../../../api/adminClient';
import { useAsyncData } from '../../../hooks/useAsyncData';
import shared from '../admin-shared.module.css';

const CHECK_ICON: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  db: Database,
  redis: Layers,
  storage: HardDrive,
};

export const AdminSystemHealth: React.FC = () => {
  const fetcher = useCallback(() => adminSystem.health(), []);
  const { data: health, loading, error, reload } = useAsyncData(fetcher);

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>System Health</h1>
          <p className={shared.pageSubtitle}>Tình trạng hạ tầng, hàng đợi xử lý, và thống kê bake job theo trạng thái.</p>
        </div>
        {health && <StatusBadge status={health.status} tone={health.status === 'ok' ? 'ok' : 'warn'} label={`Hệ thống: ${health.status}`} />}
      </div>

      {loading && !health && <div className={shared.emptyState}>Đang tải...</div>}

      {error && (
        <div className={shared.errorState}>
          <span className={shared.errorMessage}>{error}</span>
          <button className={shared.retryBtn} onClick={reload}><RotateCw size={14} /> Thử lại</button>
        </div>
      )}

      {health && (
        <>
          <div className={shared.statsGrid}>
            {Object.entries(health.checks).map(([key, value]) => {
              const Icon = CHECK_ICON[key] ?? Database;
              return (
                <div key={key} className={`${shared.statCard} glass-panel`}>
                  <span className={shared.statLabel}>
                    <Icon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                    {key.toUpperCase()}
                  </span>
                  <StatusBadge status={value} tone={value === 'ok' ? 'ok' : 'warn'} label={value} />
                </div>
              );
            })}
          </div>

          <div className={`${shared.chartCard} glass-panel`}>
            <span className={shared.chartTitle}>Độ sâu hàng đợi (Queue Depths)</span>
            <div className={shared.statsGrid} style={{ marginTop: 16 }}>
              <div className={`${shared.statCard} glass-panel`}>
                <span className={shared.statLabel}>High Priority</span>
                <span className={shared.statValue}>{health.queue_depths.high ?? '—'}</span>
              </div>
              <div className={`${shared.statCard} glass-panel`}>
                <span className={shared.statLabel}>Normal Priority</span>
                <span className={shared.statValue}>{health.queue_depths.normal ?? '—'}</span>
              </div>
              <div className={`${shared.statCard} glass-panel`}>
                <span className={shared.statLabel}>Low Priority</span>
                <span className={shared.statValue}>{health.queue_depths.low ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className={`${shared.chartCard} glass-panel`}>
            <span className={shared.chartTitle}>Bake Jobs theo trạng thái</span>
            <div className={shared.tableWrap} style={{ marginTop: 16 }}>
              <table className={shared.table}>
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(health.bake_jobs_by_status).map(([status, count]) => (
                    <tr key={status}>
                      <td><StatusBadge status={status} /></td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
