import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAnalytics, AdminApiError } from '../../../api/adminClient';
import type { AdminAnalytics as Analytics, PeriodValue, ReportFormat, ReportType } from '../../../types/admin';
import { HorizontalBarList } from '../../../components/Admin/HorizontalBarList';
import { MrrAreaChart } from '../../../components/Admin/MrrAreaChart';
import { MrrWaterfallChart } from '../../../components/Admin/MrrWaterfallChart';
import { ThreeDotsLoader, ThreeDotsBlockLoader } from '../../../components/Admin/ThreeDotsLoader';
import { useToast } from '../../../context/ToastContext';
import { MetricDetailModal, type MetricKey } from './MetricDetailModal';
import shared from '../admin-shared.module.css';
import styles from './AdminAnalytics.module.css';

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatVndSigned = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('vi-VN')} VNĐ`;
const formatPercent = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const formatDateVn = (isoStr: string) => {
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
};

const RANGES = [
  { id: 7, label: '7 ngày' },
  { id: 30, label: '30 ngày' },
  { id: 90, label: 'Quý này (90 ngày)' },
  { id: 365, label: 'Năm nay (365 ngày)' },
];

const REPORTS: {
  type: ReportType;
  label: string;
  hint: string;
  code: string;
}[] = [
  {
    type: 'transactions',
    label: 'Sổ giao dịch EXE201',
    hint: 'Đúng thứ tự cột chuẩn của sổ 07 theo quy định đối soát kế toán.',
    code: 'BR-106',
  },
  {
    type: 'channel-funnel',
    label: 'Phễu theo kênh & tuần',
    hint: 'Chu trình chuyển đổi: Đăng ký → Xác thực → Lưu thiết kế 3D → Thanh toán.',
    code: 'BR-107',
  },
  {
    type: 'revenue',
    label: 'Báo cáo doanh thu',
    hint: 'Chi tiết MRR, ARR, doanh thu theo chu kỳ tháng và tỷ trọng theo từng gói cước.',
    code: 'REV-01',
  },
  {
    type: 'users',
    label: 'Báo cáo người dùng',
    hint: 'Số lượng đăng ký mới trong kỳ, phân loại tài khoản và nguồn kênh tiếp cận.',
    code: 'USR-02',
  },
  {
    type: 'api-cost',
    label: 'Chi phí API theo ngày',
    hint: 'Chi phí điện toán API 3D/AI theo ngày và đối chiếu ngân sách tháng.',
    code: 'SF-14 / BR-108',
  },
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  payos: 'PayOS (VietQR / Thẻ)',
  momo: 'Ví MoMo',
  manual: 'Chuyển khoản thủ công',
};

const FORMATS: ReportFormat[] = ['csv', 'xlsx', 'pdf'];

type ActiveTab = 'all' | 'metrics' | 'charts' | 'reports';

/** Component hiển thị % tăng/giảm so với kỳ trước */
function Delta({ value }: { value: PeriodValue }) {
  if (value.previous === 0) {
    return <span className={`${styles.trendChip} ${styles.trendNeutral}`}>Chưa có dữ liệu kỳ trước</span>;
  }
  const change = ((value.current - value.previous) / Math.abs(value.previous)) * 100;
  const isUp = change >= 0;
  return (
    <span className={`${styles.trendChip} ${isUp ? styles.trendUp : styles.trendDown}`}>
      {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% so với kỳ trước
    </span>
  );
}

export const AdminAnalytics: React.FC = () => {
  const { toast } = useToast();
  const todayStr = useMemo(() => isoDate(new Date()), []);
  const defaultStartStr = useMemo(() => {
    const d = new Date(Date.now() - 29 * 86_400_000);
    return isoDate(d);
  }, []);

  const [startDate, setStartDate] = useState(defaultStartStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  const days = useMemo(() => {
    const from = new Date(startDate);
    const to = new Date(endDate);
    const diff = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    return diff > 0 ? diff : 1;
  }, [startDate, endDate]);

  const rangeQuery = useCallback(() => {
    return { date_from: startDate, date_to: endDate };
  }, [startDate, endDate]);

  const applyPreset = useCallback((presetDays: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - (presetDays - 1) * 86_400_000);
    setStartDate(isoDate(start));
    setEndDate(isoDate(end));
  }, []);

  const activePreset = useMemo(() => {
    const endIso = isoDate(new Date());
    if (endDate !== endIso) return null;
    for (const r of RANGES) {
      const start = new Date(new Date().getTime() - (r.id - 1) * 86_400_000);
      if (isoDate(start) === startDate) return r.id;
    }
    return null;
  }, [startDate, endDate]);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await adminAnalytics.get(rangeQuery());
      setData(result);
      setError(null);
      if (isManualRefresh) {
        toast('Dữ liệu phân tích đã được cập nhật mới nhất.', 'success');
      }
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : 'Không thể tải số liệu phân tích.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeQuery, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManualRefresh = () => {
    if (refreshing || loading) return;
    fetchData(true);
  };

  const download = async (type: ReportType, format: ReportFormat) => {
    const key = `${type}.${format}`;
    setDownloading(key);
    try {
      await adminAnalytics.downloadReport(type, format, rangeQuery());
      toast(`Đã tạo và tải file báo cáo ${format.toUpperCase()} thành công.`, 'success');
    } catch (caught) {
      toast(caught instanceof AdminApiError ? caught.message : 'Không thể tạo báo cáo đối soát.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const totalSeriesRevenue = useMemo(() => {
    if (!data?.revenue_series) return 0;
    return data.revenue_series.reduce((sum, item) => sum + item.revenue_vnd, 0);
  }, [data]);

  return (
    <div className={shared.page}>
      <div className={styles.container}>
        {/* Banner tiêu đề đồng bộ Sidebar */}
        <div className={styles.headerBanner}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <h1 className={styles.pageTitle}>Phân tích &amp; Báo cáo</h1>
              <span className={styles.liveTag}>
                <span className={styles.liveDot} />
                Dữ liệu trực tiếp
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Báo cáo hiệu suất kinh doanh, dòng tiền và trích xuất dữ liệu đối soát tự động theo quy chuẩn kế toán (BR-105 ~ BR-108, SF-14). Đã loại tài khoản nội bộ và gói tặng COMP.
            </p>
          </div>

          <div className={styles.headerControls}>
            {/* Khung chỉnh sửa ngày kỳ đối soát */}
            <div className={styles.datePickerWrapper} title="Chỉnh sửa khoảng ngày đối soát">
              <span className={styles.dateRangeLabel}>Kỳ đối soát:</span>
              <div className={styles.dateInputPair}>
                <input
                  type="date"
                  className={styles.dateField}
                  value={startDate}
                  max={endDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    if (endDate && val > endDate) {
                      toast('Ngày bắt đầu không được sau ngày kết thúc.', 'error');
                      return;
                    }
                    setStartDate(val);
                  }}
                  disabled={loading}
                  aria-label="Từ ngày đối soát"
                  title="Chọn ngày bắt đầu"
                />
                <span className={styles.dateHyphen}>—</span>
                <input
                  type="date"
                  className={styles.dateField}
                  value={endDate}
                  min={startDate}
                  max={todayStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    if (startDate && val < startDate) {
                      toast('Ngày kết thúc không được trước ngày bắt đầu.', 'error');
                      return;
                    }
                    setEndDate(val);
                  }}
                  disabled={loading}
                  aria-label="Đến ngày đối soát"
                  title="Chọn ngày kết thúc"
                />
              </div>
              <span className={styles.daysCountPill}>{days} ngày</span>
            </div>

            {/* Bộ chọn nhanh khoảng thời gian */}
            <div className={styles.rangeButtonGroup}>
              {RANGES.map((range) => (
                <button
                  key={range.id}
                  className={`${styles.rangeBtn} ${activePreset === range.id ? styles.active : ''}`}
                  onClick={() => applyPreset(range.id)}
                  disabled={loading}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Nút Refresh */}
            <button
              className={styles.refreshBtn}
              onClick={handleManualRefresh}
              disabled={refreshing || loading}
              title="Tải lại số liệu mới nhất"
            >
              {refreshing ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Tất cả danh mục
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'metrics' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            Chỉ số tài chính &amp; Tăng trưởng
            <span className={styles.tabBadge}>18</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'charts' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('charts')}
          >
            Biểu đồ phân tích
            <span className={styles.tabBadge}>5</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'reports' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            Trung tâm Báo cáo
            <span className={styles.tabBadge}>{REPORTS.length}</span>
          </button>
        </div>

        {error && (
          <div className={shared.errorState}>
            <span className={shared.errorMessage}>{error}</span>
            <button className={shared.retryBtn} onClick={() => fetchData()}>Thử tải lại</button>
          </div>
        )}

        {/* 4 HERO FINANCIAL HIGHLIGHT CARDS */}
        {activeTab !== 'reports' && (
          <div className={styles.heroGrid}>
            {/* 1. MRR */}
            <div
              className={styles.heroCard}
              onClick={() => setSelectedMetric('mrr')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.heroCardTop}>
                <span className={styles.heroLabel}>MRR · Doanh thu định kỳ tháng</span>
                <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
              </div>
              <div className={styles.heroValueRow}>
                <span className={styles.heroValue}>
                  {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.mrr_vnd ?? 0)}
                </span>
              </div>
              <div className={styles.heroFooter}>
                <span>ARR: <strong>{loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data?.arr_vnd ?? 0)}</strong></span>
                <span>ARPU: <strong>{loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data?.arpu_vnd ?? 0)}</strong></span>
              </div>
            </div>

            {/* 2. Doanh thu ghi nhận */}
            <div
              className={styles.heroCard}
              onClick={() => setSelectedMetric('revenue')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.heroCardTop}>
                <span className={styles.heroLabel}>Doanh thu ghi nhận ({days}N)</span>
                <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
              </div>
              <div className={styles.heroValueRow}>
                <span className={styles.heroValue}>
                  {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.revenue_vnd?.current ?? 0)}
                </span>
                {data?.revenue_vnd && <Delta value={data.revenue_vnd} />}
              </div>
              <div className={styles.heroFooter}>
                <span>Hoàn tiền: {loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data?.refunds_vnd?.current ?? 0)}</span>
                <span>Tỷ lệ hoàn: {loading ? <ThreeDotsLoader size="sm" /> : formatPercent(data?.refund_rate ?? null)}</span>
              </div>
            </div>

            {/* 3. Biên lợi nhuận gộp */}
            <div
              className={styles.heroCard}
              onClick={() => setSelectedMetric('gross_margin')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.heroCardTop}>
                <span className={styles.heroLabel}>Biên lợi nhuận gộp</span>
                <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
              </div>
              <div className={styles.heroValueRow}>
                <span className={styles.heroValue}>
                  {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.gross_margin_vnd ?? 0)}
                </span>
              </div>
              <div className={styles.heroFooter}>
                <span>Chi phí API: {loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data?.api_cost_vnd ?? 0)}</span>
                <span>{days} ngày áp dụng</span>
              </div>
            </div>

            {/* 4. Khách hàng trả tiền */}
            <div
              className={styles.heroCard}
              onClick={() => setSelectedMetric('paying_customers')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.heroCardTop}>
                <span className={styles.heroLabel}>Khách hàng trả tiền</span>
                <span className={styles.cardClickBadge}>Chi tiết đối soát</span>
              </div>
              <div className={styles.heroValueRow}>
                <span className={styles.heroValue}>
                  {loading ? <ThreeDotsLoader size="md" /> : (data?.paying_customers ?? 0).toLocaleString('vi-VN')}
                </span>
                {data?.new_paying_customers && <Delta value={data.new_paying_customers} />}
              </div>
              <div className={styles.heroFooter}>
                <span>Mới: +{loading ? <ThreeDotsLoader size="sm" /> : data?.new_paying_customers?.current ?? 0}</span>
                <span>Free → Paid: {loading ? <ThreeDotsLoader size="sm" /> : formatPercent(data?.free_to_paid?.rate ?? null)}</span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1: NHÓM CHỈ SỐ TĂNG TRƯỞNG & DÒNG TIỀN (Hiển thị khi tab là 'all' hoặc 'metrics') */}
        {(activeTab === 'all' || activeTab === 'metrics') && (
          <>
            {/* Nhóm Tăng trưởng & Sức khỏe người dùng */}
            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>
                    Sức khỏe Tăng trưởng &amp; Khách hàng
                  </h2>
                </div>
                <span className={styles.sectionSubtitle}>
                  Đánh giá tỷ lệ giữ chân, churn và vòng đời khách hàng theo định nghĩa mục 5.4
                </span>
              </div>

              <div className={styles.metricsGrid}>
                {/* Churn kỳ */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('churn')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Số thuê bao đến hạn gia hạn nhưng không gia hạn chia cho tổng thuê bao đến hạn.">
                        Tỷ lệ Churn (Kỳ)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatPercent(data?.churn?.rate ?? null)}
                  </div>
                  <div className={styles.metricSubText}>
                    {loading ? <ThreeDotsLoader size="sm" /> : data?.churn ? `${data.churn.churned} / ${data.churn.due} khách đến hạn không gia hạn` : 'Đang tính toán'}
                  </div>
                </div>

                {/* NRR / GRR */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('retention')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="So sánh doanh thu quy đổi tháng của cùng nhóm khách giữa 2 tháng liền kề.">
                        NRR / GRR (Duy trì)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : !data?.retention ? '—' : `${formatPercent(data.retention.nrr)} / ${formatPercent(data.retention.grr)}`}
                  </div>
                  <div className={styles.metricSubText}>
                    {loading ? <ThreeDotsLoader size="sm" /> : data?.retention ? `Tháng ${data.retention.month} (xấp xỉ theo dòng tiền)` : 'Đang tính toán'}
                  </div>
                </div>

                {/* Khách quay lại (BR-105) */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('repeat')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Khách có từ 2 hóa đơn gói trở lên chia cho khách trả tiền đã tới kỳ gia hạn lần 2.">
                        Khách quay lại (BR-105)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatPercent(data?.repeat?.rate ?? null)}
                  </div>
                  <div className={styles.metricSubText}>
                    {loading ? <ThreeDotsLoader size="sm" /> : data?.repeat ? `${data.repeat.repeat_customers}/${data.repeat.paying_customers} khách · ${data.repeat.not_yet_due} chưa đến kỳ` : 'Đang tính toán'}
                  </div>
                </div>

                {/* Chuyển đổi Free -> Trả phí */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('free_to_paid')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Số user đã xác thực email từng thanh toán ít nhất 1 lần chia cho tổng user đã xác thực.">
                        Free → Trả phí
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatPercent(data?.free_to_paid?.rate ?? null)}
                  </div>
                  <div className={styles.metricSubText}>
                    {loading ? <ThreeDotsLoader size="sm" /> : data?.free_to_paid ? `${data.free_to_paid.numerator} / ${data.free_to_paid.denominator} user đã xác thực` : 'Đang tính toán'}
                  </div>
                </div>
              </div>
            </div>

            {/* Nhóm Dòng tiền, Khấu trừ & Công nợ */}
            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>
                    Dòng tiền, Chiết khấu &amp; Công nợ
                  </h2>
                </div>
                <span className={styles.sectionSubtitle}>
                  Đối soát công nợ chờ thu, hoàn tiền, chiết khấu và thuế VAT ước tính
                </span>
              </div>

              <div className={styles.metricsGrid}>
                {/* Công nợ chờ thu (AR) */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('outstanding')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Tổng tiền hóa đơn pending/awaiting_approval tại thời điểm hiện tại.">
                        Công nợ chờ thu (AR)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.outstanding?.amount_vnd ?? 0)}
                  </div>
                  <div className={styles.metricSubText}>
                    {loading ? <ThreeDotsLoader size="sm" /> : data?.outstanding ? `${data.outstanding.count} hóa đơn đang chờ thanh toán` : '—'}
                  </div>
                </div>

                {/* Thanh toán lỗi 30 ngày */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('failed_payments')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Số hóa đơn ở trạng thái failed được tạo trong 30 ngày gần nhất.">
                        Thanh toán lỗi (30 ngày)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue} style={{ color: (data?.failed_payments?.count_30d ?? 0) > 0 ? 'var(--color-crimson)' : undefined }}>
                    {loading ? <ThreeDotsLoader size="md" /> : `${data?.failed_payments?.count_30d ?? 0} giao dịch`}
                  </div>
                  <div className={styles.metricSubText}>
                    Tổng số tiền: {loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data?.failed_payments?.amount_30d_vnd ?? 0)}
                  </div>
                </div>

                {/* Chiết khấu đã áp dụng */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('discounts')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Tổng số tiền giảm giá trên các hóa đơn đã thanh toán trong kỳ.">
                        Chiết khấu áp dụng (Kỳ)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.discounts_vnd ?? 0)}
                  </div>
                  <div className={styles.metricSubText}>
                    Áp dụng cho khuyến mãi &amp; voucher
                  </div>
                </div>

                {/* Doanh thu Credit */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('credit_revenue')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Tiền mua Credit quét 3D đã thanh toán. Tính vào dòng tiền nhưng không tính vào MRR (BR-94).">
                        Doanh thu Credit (Kỳ)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.credit_revenue_vnd ?? 0)}
                  </div>
                  <div className={styles.metricSubText}>
                    Không tính vào MRR theo chuẩn BR-94
                  </div>
                </div>

                {/* VAT thu được ước tính */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('vat')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Ước tính theo thuế suất VAT hiện hành áp lên doanh thu ghi nhận kỳ này.">
                        VAT thu được (Ước tính)
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.vat_collected_vnd ?? 0)}
                  </div>
                  <div className={styles.metricSubText}>
                    Theo cấu hình thuế suất hệ thống hiện tại
                  </div>
                </div>

                {/* Chi phí API 3D/AI */}
                <div
                  className={styles.metricCard}
                  onClick={() => setSelectedMetric('api_cost')}
                  role="button"
                  tabIndex={0}
                  title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
                >
                  <div className={styles.metricCardHeader}>
                    <div className={styles.metricLabel}>
                      <span title="Tổng chi phí điện toán của mọi lượt gọi API 3D/AI trong kỳ (SF-14).">
                        Chi phí API 3D/AI
                      </span>
                    </div>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <div className={styles.metricValue}>
                    {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data?.api_cost_vnd ?? 0)}
                  </div>
                  <div className={styles.metricSubText}>
                    Khấu trừ trực tiếp vào lợi nhuận gộp
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SECTION 2: KHU VỰC BIỂU ĐỒ PHÂN TÍCH (Hiển thị khi tab là 'all' hoặc 'charts') */}
        {(activeTab === 'all' || activeTab === 'charts') && (
          <div className={styles.sectionWrapper}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>
                  Biểu đồ phân tích trực quan
                </h2>
              </div>
              <span className={styles.sectionSubtitle}>
                Xu hướng dòng tiền qua các tháng, phân bổ gói cước, cổng thanh toán và thác biến động MRR
              </span>
            </div>

            {/* Biểu đồ cột: Doanh thu theo tháng */}
            <div
              className={`${styles.chartCard} ${styles.clickableChartCard}`}
              onClick={() => setSelectedMetric('monthly_series')}
              role="button"
              tabIndex={0}
              title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
            >
              <div className={styles.chartCardHeader}>
                <div className={styles.chartTitleWrap}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className={styles.chartTitle}>
                      Doanh thu theo chu kỳ tháng
                    </h3>
                    <span className={styles.cardClickBadge}>Chi tiết</span>
                  </div>
                  <p className={styles.chartHeaderSubtitle}>
                    Tổng hợp dòng tiền ghi nhận qua từng tháng
                  </p>
                </div>
                <span className={styles.chartBadge}>
                  Tổng chuỗi: {formatVnd(totalSeriesRevenue)}
                </span>
              </div>

              {loading ? (
                <ThreeDotsBlockLoader text="Đang tải dữ liệu chuỗi doanh thu..." minHeight={200} />
              ) : data && data.revenue_series.length > 0 ? (
                <div style={{ padding: '8px 0' }}>
                  <MrrAreaChart
                    points={data.revenue_series.map((point) => ({
                      label: point.month.slice(5),
                      value: point.revenue_vnd,
                    }))}
                    formatValue={formatVnd}
                    color="#2563EB"
                    height={200}
                  />
                </div>
              ) : (
                <div className={shared.emptyState}>Chưa có dữ liệu doanh thu tháng.</div>
              )}
            </div>

            {/* 2 Cột: Phân bổ theo Gói & Cổng thanh toán */}
            <div className={styles.chartDoubleGrid}>
              {/* Theo gói cước */}
              <div
                className={`${styles.chartCard} ${styles.clickableChartCard}`}
                onClick={() => setSelectedMetric('revenue_by_plan')}
                role="button"
                tabIndex={0}
                title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
              >
                <div className={styles.chartCardHeader}>
                  <div className={styles.chartTitleWrap}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 className={styles.chartTitle}>Cơ cấu doanh thu theo gói</h3>
                      <span className={styles.cardClickBadge}>Chi tiết</span>
                    </div>
                    <p className={styles.chartHeaderSubtitle}>Tỷ trọng đóng góp của từng gói cước</p>
                  </div>
                </div>
                {loading ? (
                  <ThreeDotsBlockLoader text="Đang phân tích cơ cấu gói cước..." minHeight={150} />
                ) : (
                  <HorizontalBarList
                    items={(data?.revenue_by_plan ?? []).map((plan) => ({
                      key: plan.plan_tier,
                      label: plan.plan_tier.charAt(0).toUpperCase() + plan.plan_tier.slice(1),
                      value: plan.revenue_vnd,
                      fraction: plan.share,
                      sub: formatPercent(plan.share),
                      color: '#2563EB',
                    }))}
                    formatValue={formatVnd}
                    emptyLabel="Chưa có giao dịch trong kỳ."
                  />
                )}
              </div>

              {/* Theo cổng thanh toán */}
              <div
                className={`${styles.chartCard} ${styles.clickableChartCard}`}
                onClick={() => setSelectedMetric('payment_methods')}
                role="button"
                tabIndex={0}
                title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
              >
                <div className={styles.chartCardHeader}>
                  <div className={styles.chartTitleWrap}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 className={styles.chartTitle}>Theo phương thức thanh toán</h3>
                      <span className={styles.cardClickBadge}>Chi tiết</span>
                    </div>
                    <p className={styles.chartHeaderSubtitle}>Phân loại kênh thanh toán PayOS / MoMo</p>
                  </div>
                </div>
                {loading ? (
                  <ThreeDotsBlockLoader text="Đang phân loại kênh thanh toán..." minHeight={150} />
                ) : (
                  <HorizontalBarList
                    items={(data?.payment_methods ?? []).map((method) => ({
                      key: method.payment_method,
                      label: PAYMENT_METHOD_LABEL[method.payment_method] ?? method.payment_method,
                      value: method.revenue_vnd,
                      fraction: method.share,
                      sub: formatPercent(method.share),
                      color: '#2563EB',
                    }))}
                    formatValue={formatVnd}
                    emptyLabel="Chưa có giao dịch trong kỳ."
                  />
                )}
              </div>
            </div>

            {/* 2 Cột: Biến động MRR Movement & Top khách hàng */}
            <div className={styles.chartDoubleGrid}>
              {/* MRR Movement */}
              <div
                className={`${styles.chartCard} ${styles.clickableChartCard}`}
                onClick={() => setSelectedMetric('mrr_movement')}
                role="button"
                tabIndex={0}
                title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
              >
                <div className={styles.chartCardHeader}>
                  <div className={styles.chartTitleWrap}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 className={styles.chartTitle}>
                        Biến động MRR ({data?.mrr_movement?.month ?? '—'})
                      </h3>
                      <span className={styles.cardClickBadge}>Chi tiết</span>
                    </div>
                    <p className={styles.chartHeaderSubtitle}>Thác doanh thu: Mở rộng vs Thu hẹp &amp; Net New MRR</p>
                  </div>
                </div>
                {loading ? (
                  <ThreeDotsBlockLoader text="Đang tải dữ liệu biến động MRR..." minHeight={200} />
                ) : data?.mrr_movement ? (
                  <MrrWaterfallChart
                    data={data.mrr_movement}
                    formatValue={formatVndSigned}
                  />
                ) : (
                  <div className={shared.emptyState}>Chưa có dữ liệu biến động.</div>
                )}
              </div>

              {/* Top khách hàng doanh thu cao */}
              <div
                className={`${styles.chartCard} ${styles.clickableChartCard}`}
                onClick={() => setSelectedMetric('top_customers')}
                role="button"
                tabIndex={0}
                title="Bấm để xem công thức tính toán và nguồn dữ liệu kiểm toán"
              >
                <div className={styles.chartCardHeader}>
                  <div className={styles.chartTitleWrap}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 className={styles.chartTitle}>Khách hàng doanh thu cao</h3>
                      <span className={styles.cardClickBadge}>Chi tiết</span>
                    </div>
                    <p className={styles.chartHeaderSubtitle}>Danh sách khách hàng VIP đóng góp cao nhất kỳ</p>
                  </div>
                </div>
                {loading ? (
                  <ThreeDotsBlockLoader text="Đang truy xuất danh sách khách hàng..." minHeight={160} />
                ) : data && data.top_customers.length > 0 ? (
                  <div className={styles.customerList}>
                    {data.top_customers.map((customer, index) => {
                      const rankClass =
                        index === 0 ? styles.rank1 :
                        index === 1 ? styles.rank2 :
                        index === 2 ? styles.rank3 :
                        styles.rankDefault;
                      return (
                        <div key={customer.user_id} className={styles.customerItem}>
                          <div className={styles.customerLeft}>
                            <div className={`${styles.rankBadge} ${rankClass}`}>
                              {index + 1}
                            </div>
                            <div className={styles.customerInfo}>
                              <span className={styles.customerEmail} title={customer.email ?? customer.user_id}>
                                {customer.email ?? customer.user_id}
                              </span>
                              <span className={styles.customerOrders}>
                                {customer.orders} đơn hàng đã hoàn tất
                              </span>
                            </div>
                          </div>
                          <span className={styles.customerAmount}>
                            {formatVnd(customer.net_paid_vnd)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={shared.emptyState}>Chưa có giao dịch khách hàng trong kỳ.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: TRUNG TÂM XUẤT BÁO CÁO (Hiển thị khi tab là 'all' hoặc 'reports') */}
        {(activeTab === 'all' || activeTab === 'reports') && (
          <div className={styles.reportsHub}>
            <div className={styles.reportsHubHeader}>
              <div className={styles.headerLeft}>
                <div className={styles.titleRow}>
                  <h2 className={styles.pageTitle} style={{ fontSize: '1.2rem' }}>
                    Trung tâm Báo cáo &amp; Đối soát dữ liệu
                  </h2>
                </div>
                <p className={styles.pageSubtitle}>
                  Trích xuất dữ liệu chi tiết theo quy chuẩn hệ thống EXE201. File xuất áp dụng theo khoảng ngày đang chọn: <strong>{formatDateVn(startDate)}</strong> đến <strong>{formatDateVn(endDate)}</strong>.
                </p>
              </div>
            </div>

            <div className={styles.reportsGrid}>
              {REPORTS.map((report) => (
                <div key={report.type} className={styles.reportCard}>
                  <div className={styles.reportTop}>
                    <div className={styles.reportMeta}>
                      <div className={styles.reportTitleRow}>
                        <h4 className={styles.reportName}>{report.label}</h4>
                        <span className={styles.reportBadge}>{report.code}</span>
                      </div>
                      <p className={styles.reportDesc}>{report.hint}</p>
                    </div>
                  </div>

                  <div className={styles.reportActions}>
                    {FORMATS.map((format) => {
                      const isCurrentDownloading = downloading === `${report.type}.${format}`;
                      return (
                        <button
                          key={format}
                          className={styles.exportBtn}
                          disabled={downloading !== null}
                          onClick={() => void download(report.type, format)}
                          title={`Tải báo cáo ${report.label} định dạng ${format.toUpperCase()}`}
                        >
                          {isCurrentDownloading ? 'Đang tạo...' : format.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL CHI TIẾT CÁCH TÍNH & BÓC TÁCH NGUỒN LOG */}
        {selectedMetric && (
          <MetricDetailModal
            metricKey={selectedMetric}
            data={data}
            days={days}
            onClose={() => setSelectedMetric(null)}
          />
        )}
      </div>
    </div>
  );
};
