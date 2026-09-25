import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type {
  DashboardStats,
  MonthlyPoint,
  SystemHealth,
  BakeJobStatus,
} from '../../../types/admin';
import styles from '../Analytics/MetricDetailModal.module.css';

export type DashboardMetricKey =
  'total_users' | 'mrr' | 'total_exports' | 'bake_pipeline' | 'revenue_chart' | 'user_growth_chart';

interface DashboardMetricModalProps {
  metricKey: DashboardMetricKey;
  stats: DashboardStats | null;
  userGrowth: MonthlyPoint[];
  revenue: MonthlyPoint[];
  revenueMonths: number;
  health: SystemHealth | null;
  onClose: () => void;
}

interface MetricConfig {
  title: string;
  category: string;
  code: string;
  currentValue: string;
  formula: string;
  variables: { symbol: string; desc: string }[];
  rules: { text: string; code?: string }[];
  dataSources: string[];
  breakdown: { label: string; value: string; note?: string; highlight?: boolean }[];
  businessMeaning: string;
}

const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')} VNĐ`;

const BAKE_STATUS_LABEL: Record<BakeJobStatus, string> = {
  completed: 'Hoàn tất',
  processing: 'Đang xử lý',
  queued: 'Trong hàng đợi',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

function getConfig(
  key: DashboardMetricKey,
  stats: DashboardStats | null,
  userGrowth: MonthlyPoint[],
  revenue: MonthlyPoint[],
  revenueMonths: number,
  health: SystemHealth | null,
): MetricConfig {
  switch (key) {
    case 'total_users':
      return {
        title: 'Tổng Người Dùng Hệ Thống',
        category: 'Người dùng & Tăng trưởng',
        code: 'SRS §5.1 / USR-01',
        currentValue: `${(stats?.total_users ?? 0).toLocaleString('vi-VN')} người dùng`,
        formula: 'Tổng người dùng = COUNT(*) từ bảng users có vai trò "user"',
        variables: [
          {
            symbol: 'COUNT(*)',
            desc: 'Đếm toàn bộ tài khoản đã đăng ký thành công, không phân biệt gói Free hay trả phí.',
          },
        ],
        rules: [
          {
            text: 'Bao gồm cả người dùng gói Free lẫn các gói trả phí đang hoạt động hoặc đã hết hạn.',
            code: 'All Tiers',
          },
          {
            text: 'Loại trừ tài khoản admin/staff nội bộ khỏi số liệu người dùng thực tế.',
            code: 'BR-83',
          },
        ],
        dataSources: ['users'],
        breakdown: [
          {
            label: 'Tổng người dùng hiện tại',
            value: `${(stats?.total_users ?? 0).toLocaleString('vi-VN')} người dùng`,
            highlight: true,
          },
          ...userGrowth.map((p) => ({
            label: `Người dùng mới tháng ${p.month.slice(5)}`,
            value: `+${p.value.toLocaleString('vi-VN')}`,
            note: 'Tăng trưởng theo tháng',
          })),
        ],
        businessMeaning:
          'Quy mô tổng thể của tệp người dùng KusShoes, là cơ sở để tính các tỷ lệ chuyển đổi và xác định tốc độ mở rộng thị trường của nền tảng thiết kế giày 3D.',
      };

    case 'mrr':
      return {
        title: 'MRR — Doanh Thu Định Kỳ Hàng Tháng',
        category: 'Doanh thu định kỳ',
        code: 'SRS §5.4 / BR-104',
        currentValue: formatVnd(stats?.mrr_vnd ?? 0),
        formula: 'MRR = ∑ (Gói tháng) + ∑ (Gói năm ÷ 12)',
        variables: [
          {
            symbol: 'Gói tháng',
            desc: 'Số tiền thực trả của khách hàng trên gói chu kỳ tháng (monthly).',
          },
          {
            symbol: 'Gói năm ÷ 12',
            desc: 'Số tiền thực trả của gói năm quy chuẩn đều về giá trị 1 tháng.',
          },
        ],
        rules: [
          {
            text: 'Chỉ tính các thuê bao đang ở trạng thái ACTIVE hoặc GRACE (trong 3 ngày ân hạn).',
            code: 'BR-23',
          },
          {
            text: 'Loại trừ gói Free và gói tặng COMP (không phát sinh tiền thực tế).',
            code: 'BR-83',
          },
          {
            text: 'Xem chi tiết ARR, ARPU và bóc tách đầy đủ tại trang Phân tích &amp; Báo cáo.',
            code: 'Ref',
          },
        ],
        dataSources: ['subscriptions', 'invoices', 'users'],
        breakdown: [
          { label: 'MRR hiện tại', value: formatVnd(stats?.mrr_vnd ?? 0), highlight: true },
          {
            label: 'ARR quy đổi (MRR × 12)',
            value: formatVnd((stats?.mrr_vnd ?? 0) * 12),
            note: 'Ước tính doanh thu 12 tháng',
          },
        ],
        businessMeaning:
          'MRR là thước đo quan trọng nhất của mô hình SaaS, phản ánh dòng tiền định kỳ có thể dự đoán được của KusShoes.',
      };

    case 'total_exports':
      return {
        title: 'Tổng Lượt Export Mô Hình 3D',
        category: 'Sản phẩm & Sử dụng',
        code: 'SRS §5.1 / EXP-01',
        currentValue: `${(stats?.total_exports ?? 0).toLocaleString('vi-VN')} lượt`,
        formula: 'Tổng lượt Export = COUNT(*) từ bảng exports',
        variables: [
          {
            symbol: 'COUNT(*)',
            desc: 'Đếm mọi tác vụ xuất mô hình 3D thành công, không phân biệt định dạng.',
          },
        ],
        rules: [
          {
            text: 'Bao gồm các định dạng xuất được hỗ trợ: GLB, OBJ và gói ZIP kèm textures.',
            code: 'Formats',
          },
          {
            text: 'Chỉ tính các lượt export đã hoàn tất, không tính các tác vụ lỗi hoặc bị hủy.',
            code: 'Completed Only',
          },
        ],
        dataSources: ['exports'],
        breakdown: [
          {
            label: 'Tổng lượt export ghi nhận',
            value: `${(stats?.total_exports ?? 0).toLocaleString('vi-VN')} lượt`,
            highlight: true,
          },
        ],
        businessMeaning:
          'Đo lường mức độ người dùng thực sự hoàn tất quy trình thiết kế và mang mô hình 3D ra khỏi nền tảng để sản xuất hoặc chia sẻ.',
      };

    case 'bake_pipeline': {
      const byStatus = health?.bake_jobs_by_status;
      const total = byStatus ? Object.values(byStatus).reduce((a, b) => a + b, 0) : 0;
      return {
        title: 'Bake Job Pipeline — Hạ Tầng Dựng Mô Hình 3D',
        category: 'Hạ tầng & Vận hành',
        code: 'SRS §6.2 / SF-14',
        currentValue: `${total.toLocaleString('vi-VN')} job`,
        formula:
          'Tổng job = ∑ (Job theo từng trạng thái: queued, processing, completed, failed, cancelled)',
        variables: [
          {
            symbol: 'Bake Job',
            desc: 'Tác vụ nền dựng texture PBR và mesh 3D hoàn chỉnh từ thiết kế của người dùng.',
          },
        ],
        rules: [
          {
            text: 'Trạng thái hệ thống "Ổn định" khi không có job nào tồn đọng bất thường trong hàng đợi.',
            code: 'health.status',
          },
          {
            text: 'Hàng đợi được phân theo 3 mức ưu tiên: cao (high), thường (normal), thấp (low).',
            code: 'Queue Priority',
          },
        ],
        dataSources: ['bake_jobs', 'system_health_service'],
        breakdown: [
          {
            label: 'Tổng số job trong hệ thống',
            value: `${total.toLocaleString('vi-VN')} job`,
            highlight: true,
          },
          ...(Object.keys(byStatus ?? {}) as BakeJobStatus[]).map((s) => ({
            label: BAKE_STATUS_LABEL[s],
            value: `${(byStatus?.[s] ?? 0).toLocaleString('vi-VN')} job`,
          })),
          { label: 'Hàng đợi ưu tiên cao (High)', value: `${health?.queue_depths.high ?? 0} job` },
          { label: 'Hàng đợi thường (Normal)', value: `${health?.queue_depths.normal ?? 0} job` },
          { label: 'Hàng đợi thấp (Low)', value: `${health?.queue_depths.low ?? 0} job` },
        ],
        businessMeaning:
          'Theo dõi sức khỏe hạ tầng render 3D theo thời gian thực, phát hiện sớm tình trạng nghẽn hàng đợi hoặc job lỗi ảnh hưởng trải nghiệm thiết kế của người dùng.',
      };
    }

    case 'revenue_chart': {
      const total = revenue.reduce((sum, p) => sum + p.value, 0);
      return {
        title: `Chuỗi Doanh Thu Theo Tháng (${revenueMonths} tháng gần nhất)`,
        category: 'Xu hướng dòng tiền',
        code: 'SRS §5.4 / Monthly Trend',
        currentValue: formatVnd(total),
        formula: 'Doanh thu tháng M = ∑ (Hóa đơn PAID trong tháng M) - ∑ (Hoàn tiền trong tháng M)',
        variables: [
          {
            symbol: 'Tháng M',
            desc: 'Thời gian theo tháng dương lịch tính theo múi giờ Việt Nam GMT+7.',
          },
        ],
        rules: [
          {
            text: 'Nhóm doanh thu thực thu theo tháng dương lịch, quy đổi MRR định kỳ.',
            code: 'GMT+7',
          },
          {
            text: 'Xem bóc tách chi tiết theo gói cước và cổng thanh toán tại trang Phân tích &amp; Báo cáo.',
            code: 'Ref',
          },
        ],
        dataSources: ['invoices (nhóm theo tháng paid_at)'],
        breakdown: [
          {
            label: `Tổng doanh thu ${revenueMonths} tháng`,
            value: formatVnd(total),
            highlight: true,
          },
          ...revenue.map((p) => ({
            label: `Tháng ${p.month.slice(5)}`,
            value: formatVnd(p.value),
          })),
        ],
        businessMeaning:
          'Giúp nhận diện xu hướng tăng trưởng doanh số theo mùa vụ thiết kế giày và biến động dòng tiền định kỳ qua từng tháng.',
      };
    }

    case 'user_growth_chart': {
      const total = userGrowth.reduce((sum, p) => sum + p.value, 0);
      return {
        title: 'Tăng Trưởng Người Dùng Mới Theo Tháng',
        category: 'Người dùng & Tăng trưởng',
        code: 'SRS §5.1 / Growth Trend',
        currentValue: `${total.toLocaleString('vi-VN')} người dùng mới`,
        formula: 'Người dùng mới tháng M = COUNT(users.created_at trong tháng M)',
        variables: [
          {
            symbol: 'created_at',
            desc: 'Thời điểm tài khoản người dùng hoàn tất đăng ký thành công.',
          },
        ],
        rules: [
          { text: 'Tính theo tháng dương lịch, múi giờ Việt Nam GMT+7.', code: 'GMT+7' },
          {
            text: 'Loại trừ tài khoản admin/staff nội bộ khỏi số liệu tăng trưởng.',
            code: 'BR-83',
          },
        ],
        dataSources: ['users (nhóm theo tháng created_at)'],
        breakdown: [
          {
            label: `Tổng người dùng mới (${userGrowth.length} tháng)`,
            value: `${total.toLocaleString('vi-VN')} người dùng`,
            highlight: true,
          },
          ...userGrowth.map((p) => ({
            label: `Tháng ${p.month.slice(5)}`,
            value: `+${p.value.toLocaleString('vi-VN')}`,
          })),
        ],
        businessMeaning:
          'Theo dõi tốc độ mở rộng tệp người dùng mới để đánh giá hiệu quả các kênh marketing và onboarding của KusShoes.',
      };
    }

    default:
      return {
        title: 'Thông Tin Chỉ Số',
        category: 'Tổng quan',
        code: 'SRS §5.1',
        currentValue: '—',
        formula: 'Đang cập nhật công thức.',
        variables: [],
        rules: [],
        dataSources: [],
        breakdown: [],
        businessMeaning: '',
      };
  }
}

export const DashboardMetricModal: React.FC<DashboardMetricModalProps> = ({
  metricKey,
  stats,
  userGrowth,
  revenue,
  revenueMonths,
  health,
  onClose,
}) => {
  const config = getConfig(metricKey, stats, userGrowth, revenue, revenueMonths, health);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleArea}>
              <div className={styles.badgeRow}>
                <span className={styles.categoryBadge}>{config.category}</span>
                <span className={styles.codeBadge}>{config.code}</span>
              </div>
              <h3 className={styles.title}>{config.title}</h3>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng cửa sổ">
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.valueBanner}>
            <span className={styles.valueBannerLabel}>Giá trị ghi nhận hiện thời</span>
            <span className={styles.valueBannerNumber}>{config.currentValue}</span>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>Công thức tính toán (Formula)</h4>
            <div className={styles.formulaBox}>{config.formula}</div>
            {config.variables.length > 0 && (
              <div className={styles.variableList}>
                {config.variables.map((v) => (
                  <div key={v.symbol} className={styles.variableItem}>
                    <span className={styles.variableSymbol}>{v.symbol}:</span>
                    <span className={styles.variableDesc}>{v.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {config.breakdown.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionHeading}>
                Bóc tách cấu thành số liệu thực tế (Audit Breakdown)
              </h4>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Thành phần số liệu</th>
                      <th style={{ textAlign: 'right' }}>Giá trị thực tế</th>
                      <th>Ghi chú nghiệp vụ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.breakdown.map((row, idx) => (
                      <tr
                        key={idx}
                        className={row.highlight ? styles.tableRowHighlight : undefined}
                      >
                        <td className={styles.cellLabel}>{row.label}</td>
                        <td className={styles.cellValue}>{row.value}</td>
                        <td className={styles.cellNote}>{row.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h4 className={styles.sectionHeading}>
              Nguồn dữ liệu &amp; Điều kiện kiểm toán (Audit Criteria)
            </h4>
            <div className={styles.ruleList}>
              {config.dataSources.length > 0 && (
                <div className={styles.ruleItem}>
                  <span>
                    Bảng cơ sở dữ liệu:{' '}
                    {config.dataSources.map((ds) => (
                      <span key={ds} className={styles.ruleCode} style={{ marginRight: 4 }}>
                        {ds}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {config.rules.map((rule, idx) => (
                <div key={idx} className={styles.ruleItem}>
                  <span>
                    {rule.code && (
                      <span className={styles.ruleCode} style={{ marginRight: 6 }}>
                        {rule.code}
                      </span>
                    )}
                    {rule.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {config.businessMeaning && (
            <div className={styles.section}>
              <h4 className={styles.sectionHeading}>Ý nghĩa kinh doanh &amp; Ra quyết định</h4>
              <div className={styles.meaningBox}>{config.businessMeaning}</div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
