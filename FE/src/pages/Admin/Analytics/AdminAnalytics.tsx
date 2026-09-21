import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, DollarSign, Download, Percent, Repeat, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { adminAnalytics, AdminApiError } from '../../../api/adminClient';
import type { AdminAnalytics as Analytics, PeriodValue, ReportFormat, ReportType } from '../../../types/admin';
import { MiniBarChart } from '../../../components/Admin/MiniBarChart';
import { useToast } from '../../../context/ToastContext';
import shared from '../admin-shared.module.css';

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;
const formatPercent = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const RANGES = [
  { id: 7, label: '7 ngày' },
  { id: 30, label: '30 ngày' },
  { id: 90, label: 'Quý này (90 ngày)' },
  { id: 365, label: 'Năm nay (365 ngày)' },
];

const REPORTS: { type: ReportType; label: string; hint: string }[] = [
  { type: 'transactions', label: 'Sổ giao dịch EXE201', hint: 'Đúng thứ tự cột của sổ 07 (BR-106)' },
  { type: 'channel-funnel', label: 'Phễu theo kênh & tuần', hint: 'Đăng ký → xác thực → lưu thiết kế → thanh toán (BR-107)' },
  { type: 'revenue', label: 'Báo cáo doanh thu', hint: 'MRR, ARR, doanh thu theo tháng và theo gói' },
  { type: 'users', label: 'Báo cáo người dùng', hint: 'Đăng ký mới trong kỳ, kênh đến' },
];

const FORMATS: ReportFormat[] = ['csv', 'xlsx', 'pdf'];

/** "+12,3% so với kỳ trước" style comparison (kỳ trước = khoảng ngày liền trước, cùng độ dài). */
function Delta({ value }: { value: PeriodValue }) {
  if (value.previous === 0) return <span className={shared.subText}>Chưa có dữ liệu kỳ trước</span>;
  const change = ((value.current - value.previous) / Math.abs(value.previous)) * 100;
  const up = change >= 0;
  return (
    <span className={shared.subText} style={{ color: up ? 'var(--status-scanned)' : 'var(--color-crimson)' }}>
      {up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% so với kỳ trước
    </span>
  );
}

export const AdminAnalytics: React.FC = () => {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const rangeQuery = useCallback(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    return { date_from: isoDate(start), date_to: isoDate(end) };
  }, [days]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminAnalytics
      .get(rangeQuery())
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError(null);
      })
      .catch((caught) => alive && setError(caught instanceof Error ? caught.message : 'Không thể tải số liệu.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [rangeQuery]);

  const download = async (type: ReportType, format: ReportFormat) => {
    const key = `${type}.${format}`;
    setDownloading(key);
    try {
      await adminAnalytics.downloadReport(type, format, rangeQuery());
    } catch (caught) {
      toast(caught instanceof AdminApiError ? caught.message : 'Không thể tạo báo cáo.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const tile = (label: string, icon: React.ReactNode, value: string, sub?: React.ReactNode) => (
    <div className={`${shared.statCard} glass-panel`}>
      <span className={shared.statLabel}>{icon}{label}</span>
      <span className={shared.statValue}>{loading ? '—' : value}</span>
      {sub}
    </div>
  );
  const icon = (node: React.ReactNode) => <span style={{ verticalAlign: -2, marginRight: 6, display: 'inline-flex' }}>{node}</span>;

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Phân tích &amp; Báo cáo</h1>
          <p className={shared.pageSubtitle}>
            Chỉ số kinh doanh theo định nghĩa mục 5.4. Đã loại tài khoản nội bộ và gói COMP.
          </p>
        </div>
        <div className={shared.toolbar}>
          {RANGES.map((range) => (
            <button
              key={range.id}
              className={days === range.id ? 'btn-neon-orange' : 'btn-outline'}
              onClick={() => setDays(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={shared.errorState}><span className={shared.errorMessage}>{error}</span></div>}

      <div className={shared.statsGrid}>
        {tile('MRR', icon(<DollarSign size={14} />), formatVnd(data?.mrr_vnd ?? 0))}
        {tile('ARR', icon(<TrendingUp size={14} />), formatVnd(data?.arr_vnd ?? 0))}
        {tile('ARPU', icon(<Users size={14} />), formatVnd(data?.arpu_vnd ?? 0))}
        {tile('Khách trả tiền', icon(<Users size={14} />), String(data?.paying_customers ?? 0))}
        {tile(
          'Doanh thu ghi nhận (kỳ)',
          icon(<BarChart3 size={14} />),
          formatVnd(data?.revenue_vnd.current ?? 0),
          data && <Delta value={data.revenue_vnd} />,
        )}
        {tile('Hoàn tiền (kỳ)', icon(<AlertTriangle size={14} />), formatVnd(data?.refunds_vnd.current ?? 0), data && <Delta value={data.refunds_vnd} />)}
        {tile(
          'Khách trả tiền mới',
          icon(<Users size={14} />),
          String(data?.new_paying_customers.current ?? 0),
          data && <Delta value={data.new_paying_customers} />,
        )}
        {tile(
          'Churn (kỳ)',
          icon(<Percent size={14} />),
          formatPercent(data?.churn.rate ?? null),
          data && <span className={shared.subText}>{data.churn.churned} / {data.churn.due} khách đến hạn không gia hạn</span>,
        )}
        {tile(
          'NRR / GRR',
          icon(<Percent size={14} />),
          data ? `${formatPercent(data.retention.nrr)} / ${formatPercent(data.retention.grr)}` : '—',
          data && <span className={shared.subText}>Tháng {data.retention.month} (xấp xỉ theo dòng tiền)</span>,
        )}
        {tile(
          'Free → trả phí',
          icon(<Percent size={14} />),
          formatPercent(data?.free_to_paid.rate ?? null),
          data && <span className={shared.subText}>{data.free_to_paid.numerator} / {data.free_to_paid.denominator} người đã xác thực</span>,
        )}
        {tile(
          'Khách quay lại (BR-105)',
          icon(<Repeat size={14} />),
          formatPercent(data?.repeat.rate ?? null),
          data && (
            <span className={shared.subText}>
              {data.repeat.repeat_customers} / {data.repeat.paying_customers} khách · {data.repeat.not_yet_due} chưa đến kỳ gia hạn
            </span>
          ),
        )}
        {tile(
          'Thanh toán lỗi (30 ngày)',
          icon(<AlertTriangle size={14} />),
          String(data?.failed_payments.count_30d ?? 0),
          data && <span className={shared.subText}>{formatVnd(data.failed_payments.amount_30d_vnd)}</span>,
        )}
      </div>

      <div className={shared.chartsGrid}>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}><h3 className={shared.chartTitle}>Doanh thu theo tháng</h3></div>
          {data && data.revenue_series.length > 0 ? (
            <MiniBarChart
              points={data.revenue_series.map((point) => ({ label: point.month.slice(5), value: point.revenue_vnd }))}
              formatValue={formatVnd}
            />
          ) : (
            <div className={shared.emptyState}>Chưa có doanh thu.</div>
          )}
        </div>

        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}><h3 className={shared.chartTitle}>Doanh thu theo gói</h3></div>
          <table className={shared.table}>
            <thead><tr><th>Gói</th><th>Doanh thu</th><th>Đóng góp</th></tr></thead>
            <tbody>
              {(data?.revenue_by_plan ?? []).map((plan) => (
                <tr key={plan.plan_tier}>
                  <td style={{ textTransform: 'capitalize' }}>{plan.plan_tier}</td>
                  <td>{formatVnd(plan.revenue_vnd)}</td>
                  <td className={shared.mutedCell}>{formatPercent(plan.share)}</td>
                </tr>
              ))}
              {data && data.revenue_by_plan.length === 0 && (
                <tr><td colSpan={3}><div className={shared.emptyState}>Chưa có giao dịch trong kỳ.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={shared.chartsGrid}>
        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}><h3 className={shared.chartTitle}>Biến động doanh thu ({data?.mrr_movement.month ?? '—'})</h3></div>
          <table className={shared.table}>
            <tbody>
              {data && (
                [
                  ['Mới', data.mrr_movement.new],
                  ['Mở rộng', data.mrr_movement.expansion],
                  ['Kích hoạt lại', data.mrr_movement.reactivation],
                  ['Thu hẹp', -data.mrr_movement.contraction],
                  ['Rời bỏ', -data.mrr_movement.churn],
                  ['Net new', data.mrr_movement.net_new],
                ] as [string, number][]
              ).map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td style={{ color: value < 0 ? 'var(--color-crimson)' : undefined }}>{formatVnd(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`${shared.chartCard} glass-panel`}>
          <div className={shared.chartHeader}><h3 className={shared.chartTitle}>Khách hàng doanh thu cao</h3></div>
          <table className={shared.table}>
            <thead><tr><th>Khách hàng</th><th>Đơn</th><th>Đã trả (ròng)</th></tr></thead>
            <tbody>
              {(data?.top_customers ?? []).map((customer) => (
                <tr key={customer.user_id}>
                  <td className={shared.mutedCell}>{customer.email ?? customer.user_id}</td>
                  <td>{customer.orders}</td>
                  <td>{formatVnd(customer.net_paid_vnd)}</td>
                </tr>
              ))}
              {data && data.top_customers.length === 0 && (
                <tr><td colSpan={3}><div className={shared.emptyState}>Chưa có khách trả tiền.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${shared.chartCard} glass-panel`}>
        <div className={shared.chartHeader}><h3 className={shared.chartTitle}>Xuất báo cáo</h3></div>
        <p className={shared.pageSubtitle} style={{ marginBottom: 12 }}>
          Áp dụng cho khoảng ngày đang chọn ở trên. Chưa hỗ trợ báo cáo định kỳ gửi email.
        </p>
        <table className={shared.table}>
          <tbody>
            {REPORTS.map((report) => (
              <tr key={report.type}>
                <td>
                  {report.label}
                  <div className={shared.subText}>{report.hint}</div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className={shared.rowActions} style={{ justifyContent: 'flex-end' }}>
                    {FORMATS.map((format) => (
                      <button
                        key={format}
                        className="btn-outline"
                        disabled={downloading !== null}
                        onClick={() => void download(report.type, format)}
                      >
                        <Download size={14} /> {downloading === `${report.type}.${format}` ? '...' : format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
