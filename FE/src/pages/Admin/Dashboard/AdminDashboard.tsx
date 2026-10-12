import React, { useState } from 'react';
import { FinancePanel } from './FinancePanel';
import shared from '../admin-shared.module.css';
import styles from './AdminDashboard.module.css';

interface AdminDashboardProps {
  navigate?: (page: string) => void;
}

const LABELS = {
  title: 'Tổng quan tài chính KusShoes',
  subtitle: 'Theo dõi doanh thu, chi phí vận hành và lợi nhuận của hệ thống.',
  liveBadge: 'Live Sync',
  refresh: 'Làm mới',
  refreshing: 'Đang tải...',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ navigate }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className={shared.page}>
      <div className={styles.container}>
        <div className={styles.banner}>
          <div className={styles.bannerLeft}>
            <div className={styles.bannerTitleRow}>
              <h1 className={styles.bannerTitle}>{LABELS.title}</h1>
              <span className={styles.liveBadge}>
                <span className={styles.liveDot} />
                {LABELS.liveBadge}
              </span>
            </div>
            <p className={styles.bannerSubtitle}>{LABELS.subtitle}</p>
          </div>

          <div className={styles.bannerActions}>
            <button
              className={styles.bannerBtn}
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={refreshing}
            >
              <span>{refreshing ? LABELS.refreshing : LABELS.refresh}</span>
            </button>
          </div>
        </div>

        <FinancePanel navigate={navigate} refreshKey={refreshKey} onLoadingChange={setRefreshing} />
      </div>
    </div>
  );
};
