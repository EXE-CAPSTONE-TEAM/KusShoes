import React, { useCallback, useEffect, useState } from 'react';
import { adminAnalytics } from '../../../../api/adminClient';
import type {
  MarketingAnalyticsResponse,
  PlatformEvaluation,
  RealtimeAnalyticsResponse,
} from '../../../../types/admin';
import { HorizontalBarList } from '../../../../components/Admin/HorizontalBarList';
import { ThreeDotsLoader, ThreeDotsBlockLoader } from '../../../../components/Admin/ThreeDotsLoader';
import { useToast } from '../../../../context/ToastContext';
import { Ga4SetupGuideModal } from './Ga4SetupGuideModal';
import styles from './MarketingTab.module.css';

interface MarketingTabProps {
  startDate: string;
  endDate: string;
}

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;
const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}p ${s < 10 ? '0' : ''}${s}s`;
};

const EVAL_LABEL: Record<PlatformEvaluation, { text: string; className: string }> = {
  high_performing: { text: '⭐ Rất tốt', className: styles.evalHigh },
  moderate: { text: '👍 Ổn định', className: styles.evalModerate },
  needs_attention: { text: '🔍 Cần chú ý', className: styles.evalNeeds },
};

export const MarketingTab: React.FC<MarketingTabProps> = ({ startDate, endDate }) => {
  const { toast } = useToast();
  const [data, setData] = useState<MarketingAnalyticsResponse | null>(null);
  const [realtime, setRealtime] = useState<RealtimeAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [showGuideModal, setShowGuideModal] = useState(false);

  const fetchMarketingData = useCallback(async (isRefresh = false) => {
    setLoading(true);
    try {
      const res = await adminAnalytics.getMarketing({
        date_from: startDate,
        date_to: endDate,
        country: selectedCountry === 'all' ? undefined : selectedCountry,
        refresh: isRefresh,
      });
      setData(res);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không thể tải số liệu Marketing & GA4.', 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedCountry, toast]);

  const fetchRealtime = useCallback(async () => {
    try {
      const res = await adminAnalytics.getRealtime();
      setRealtime(res);
    } catch {
      // Ignore background realtime poll errors
    }
  }, []);

  useEffect(() => {
    fetchMarketingData();
  }, [fetchMarketingData]);

  useEffect(() => {
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 30_000);
    return () => clearInterval(interval);
  }, [fetchRealtime]);

  const hero = data?.hero_metrics;

  return (
    <div className={styles.container}>
      {/* 1. Bar trạng thái Realtime & Kết nối */}
      <div className={styles.topStatusRow}>
        <div className={styles.realtimePill}>
          <span className={styles.pulseDot} />
          <span>
            {realtime && realtime.active_now === null ? (
              'GA4 chưa cấu hình — không có dữ liệu thời gian thực'
            ) : realtime ? (
              <>
                <strong>{realtime.active_now}</strong> khách đang truy cập trực tiếp (30 phút qua)
              </>
            ) : (
              'Đang kiểm tra lưu lượng thời gian thực...'
            )}
          </span>
        </div>

        <div className={styles.connectionActions}>
          <span
            className={`${styles.connectionBadge} ${
              data?.ga4_configured ? styles.connected : styles.unconfigured
            }`}
          >
            {data?.ga4_configured ? '✓ GA4 Data API: Đã kết nối' : '⚠ GA4 Data API: Chưa cấu hình Key'}
          </span>
          <button className={styles.guideBtn} onClick={() => setShowGuideModal(true)}>
            {data?.ga4_configured ? 'Kiểm tra kết nối' : 'Hướng dẫn kết nối GA4'}
          </button>
        </div>
      </div>

      {/* 2. 4 Thẻ Hero KPIs */}
      <div className={styles.heroGrid}>
        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Khách truy cập mới (New Visitors)</span>
          <div className={styles.heroValueRow}>
            <span className={styles.heroValue}>
              {loading ? <ThreeDotsLoader size="md" /> : (hero?.new_users ?? 0).toLocaleString('vi-VN')}
            </span>
          </div>
          <span className={styles.heroSub}>
            Trên tổng số {loading ? '...' : (hero?.active_users ?? 0).toLocaleString('vi-VN')} khách ghé thăm
          </span>
        </div>

        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Tỷ lệ khách quay lại (Retention)</span>
          <div className={styles.heroValueRow}>
            <span className={styles.heroValue}>
              {loading ? <ThreeDotsLoader size="md" /> : formatPercent(hero?.returning_rate ?? 0)}
            </span>
          </div>
          <span className={styles.heroSub}>Khách nhớ thương hiệu và quay lại web</span>
        </div>

        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Thời gian trung bình trên phiên</span>
          <div className={styles.heroValueRow}>
            <span className={styles.heroValue}>
              {loading ? (
                <ThreeDotsLoader size="md" />
              ) : (
                formatDuration(hero?.average_session_duration ?? 0)
              )}
            </span>
          </div>
          <span className={styles.heroSub}>
            Tỷ lệ thoát: {loading ? '...' : formatPercent(hero?.bounce_rate ?? 0)}
          </span>
        </div>

        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Tỷ lệ tương tác (Engagement)</span>
          <div className={styles.heroValueRow}>
            <span className={styles.heroValue}>
              {loading ? <ThreeDotsLoader size="md" /> : formatPercent(hero?.engagement_rate ?? 0)}
            </span>
          </div>
          <span className={styles.heroSub}>
            Tổng lượt xem trang: {loading ? '...' : (hero?.screen_page_views ?? 0).toLocaleString('vi-VN')}
          </span>
        </div>
      </div>

      {/* 3. Bảng xếp hạng Nền tảng Đa tầng (Platform Performance Scorecard) */}
      <div className={styles.sectionWrapper}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Bảng xếp hạng Nền tảng Giới thiệu (Platform Scorecard)</h2>
            <span className={styles.sectionSubtitle}>
              Đối soát trực tiếp giữa Lưu lượng (GA4) và Tỷ lệ chuyển đổi thành Tài khoản &amp; Doanh thu thực tế (DB)
            </span>
          </div>
        </div>

        <div className={styles.cardTableWrap}>
          {loading ? (
            <ThreeDotsBlockLoader text="Đang đối soát số liệu các nền tảng..." minHeight={200} />
          ) : (
            <table className={styles.scorecardTable}>
              <thead>
                <tr>
                  <th>Nền tảng</th>
                  <th>Lượt khách (GA4)</th>
                  <th>Số phiên</th>
                  <th>Thời gian TB</th>
                  <th>Tỷ lệ tương tác</th>
                  <th>Tài khoản mới (DB)</th>
                  <th>Tỷ lệ đăng ký</th>
                  <th>Khách trả tiền</th>
                  <th>Doanh thu mang lại</th>
                  <th>Đánh giá</th>
                </tr>
              </thead>
              <tbody>
                {(data?.scorecard ?? []).map((row) => (
                  <tr key={row.platform}>
                    <td className={styles.platformCell}>{row.platform}</td>
                    <td>{row.visitors.toLocaleString('vi-VN')}</td>
                    <td>{row.sessions.toLocaleString('vi-VN')}</td>
                    <td>{formatDuration(row.avg_duration_sec)}</td>
                    <td>{formatPercent(row.engagement_rate)}</td>
                    <td>
                      <strong>{row.signups.toLocaleString('vi-VN')}</strong>
                    </td>
                    <td>{row.signup_rate === null ? '—' : formatPercent(row.signup_rate)}</td>
                    <td>{row.paying_customers.toLocaleString('vi-VN')}</td>
                    <td>
                      <strong style={{ color: 'var(--color-orange, #f97316)' }}>
                        {formatVnd(row.revenue_vnd)}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`${styles.evalBadge} ${
                          EVAL_LABEL[row.evaluation]?.className ?? ''
                        }`}
                      >
                        {EVAL_LABEL[row.evaluation]?.text ?? row.evaluation}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!data || data.scorecard.length === 0) && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 24 }}>
                      Chưa có dữ liệu chuyển đổi trong kỳ này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 4. Split Grid: Phân bổ Địa lý & Phễu Chuyển đổi Marketing */}
      <div className={styles.splitGrid}>
        {/* Panel Trái: Phân bổ Địa lý */}
        <div className={styles.panelCard}>
          <div className={styles.geoControls}>
            <div>
              <h3 className={styles.sectionTitle} style={{ fontSize: '1rem' }}>
                Khu vực &amp; Tỉnh/Thành phố
              </h3>
              <span className={styles.sectionSubtitle}>Khách hàng tập trung ở đâu</span>
            </div>
            {data && data.countries.length > 0 && (
              <select
                className={styles.geoSelect}
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                aria-label="Lọc theo quốc gia"
              >
                <option value="all">Tất cả quốc gia</option>
                {data.countries.map((c) => (
                  <option key={c.country} value={c.country}>
                    {c.country} ({c.users})
                  </option>
                ))}
              </select>
            )}
          </div>

          {loading ? (
            <ThreeDotsBlockLoader text="Đang phân tích địa lý..." minHeight={180} />
          ) : (
            <HorizontalBarList
              items={(data?.cities ?? []).slice(0, 8).map((c) => ({
                key: `${c.city}-${c.country}`,
                label: `${c.city} (${c.country})`,
                value: c.users,
                fraction: c.share,
                sub: `${formatPercent(c.share)} (${c.sessions} phiên)`,
                color: '#10b981',
              }))}
              formatValue={(v) => `${v.toLocaleString('vi-VN')} khách`}
              emptyLabel="Chưa có dữ liệu địa lý trong kỳ."
            />
          )}
        </div>

        {/* Panel Phải: Phễu Chuyển đổi Marketing */}
        <div className={styles.panelCard}>
          <div>
            <h3 className={styles.sectionTitle} style={{ fontSize: '1rem' }}>
              Phễu Chuyển đổi Marketing
            </h3>
            <span className={styles.sectionSubtitle}>
              Tỷ lệ duy trì qua từng bước từ Truy cập đến Trả phí
            </span>
          </div>

          {loading ? (
            <ThreeDotsBlockLoader text="Đang tổng hợp phễu..." minHeight={180} />
          ) : (
            <div className={styles.funnelContainer}>
              {(data?.funnel ?? []).map((step, idx) => (
                <div key={step.step} className={styles.funnelStepRow}>
                  <div className={styles.funnelStepLeft}>
                    <div className={styles.funnelStepNum}>{idx + 1}</div>
                    <div>
                      <div className={styles.funnelStepTitle}>{step.step}</div>
                      <div className={styles.funnelStepLabel}>{step.label}</div>
                    </div>
                  </div>
                  <div className={styles.funnelStepRight}>
                    <span className={styles.funnelStepCount}>
                      {step.count.toLocaleString('vi-VN')}
                    </span>
                    {idx > 0 && (
                      <span className={styles.funnelStepPct}>
                        ({formatPercent(step.conversion_rate)})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Hiệu quả Chiến dịch (Campaigns Table) */}
      {data && data.campaigns.length > 0 && (
        <div className={styles.sectionWrapper}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Hiệu quả Chiến dịch (UTM Campaigns)</h2>
              <span className={styles.sectionSubtitle}>
                Thống kê các chiến dịch truyền thông mang lại người dùng và doanh thu thực tế
              </span>
            </div>
          </div>

          <div className={styles.cardTableWrap}>
            <table className={styles.scorecardTable}>
              <thead>
                <tr>
                  <th>Tên chiến dịch (utm_campaign)</th>
                  <th>Tài khoản đăng ký</th>
                  <th>Khách hàng trả tiền</th>
                  <th>Doanh thu phát sinh</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((camp) => (
                  <tr key={camp.campaign}>
                    <td>
                      <code>{camp.campaign}</code>
                    </td>
                    <td>{camp.signups.toLocaleString('vi-VN')}</td>
                    <td>{camp.paying_customers.toLocaleString('vi-VN')}</td>
                    <td>
                      <strong style={{ color: 'var(--color-orange, #f97316)' }}>
                        {formatVnd(camp.revenue_vnd)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Hướng dẫn Cấu hình */}
      {showGuideModal && (
        <Ga4SetupGuideModal
          onClose={() => setShowGuideModal(false)}
          onSuccess={() => {
            fetchMarketingData(true);
            toast('Đã xác nhận kết nối Google Analytics 4 thành công!', 'success');
          }}
        />
      )}
    </div>
  );
};
