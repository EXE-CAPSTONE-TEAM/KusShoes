import React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinancePoint } from '../../types/admin';
import { AXIS_LINE, TICK_LINE, TICK_SIZE, formatCompactVnd } from './chartUtils';
import styles from './FinanceTrendChart.module.css';

export type FinanceGranularity = 'day' | 'month';

interface FinanceTrendChartProps {
  points: FinancePoint[];
  granularity: FinanceGranularity;
  height?: number;
  /** Ghi chú phụ trong trạng thái rỗng (ví dụ ngày dữ liệu bắt đầu). */
  emptyHint?: string;
  /** Nếu có, trạng thái rỗng hiện nút để chuyển sang khoảng thời gian dài hơn. */
  onShowLonger?: () => void;
  showLongerLabel?: string;
}

const LABELS = {
  empty: 'Chưa có dữ liệu tài chính trong giai đoạn này.',
  unit: '(Đơn vị: VNĐ)',
  revenue: 'Doanh thu',
  profit: 'Lợi nhuận',
  apiCost: 'Chi phí API',
  maintenance: 'Chi phí duy trì',
  month: 'Tháng',
  ariaChart: 'Biểu đồ doanh thu và lợi nhuận',
};

const COLOR_REVENUE = 'var(--color-orange)';
const COLOR_PROFIT = 'var(--status-scanned)';
// DS §1: không gradient trang trí — vùng dưới đường là mảng phẳng mờ.
const AREA_FILL_OPACITY = 0.12;
// Kích thước khởi tạo để biểu đồ render được trước khi ResponsiveContainer đo xong (SSR/jsdom).
const INITIAL_WIDTH = 720;
// Số nhãn trục X tối đa khi chuỗi dày (30 ngày), tránh chồng chữ.
const MAX_X_LABELS = 8;
const DENSE_SERIES = 12;

/** period_start là yyyy-MM-dd; tách chuỗi để tránh lệch múi giờ khi parse Date. */
export function formatPeriodLabel(periodStart: string, granularity: FinanceGranularity): string {
  const [, month, day] = periodStart.split('-');
  if (granularity === 'day') return `${day}/${month}`;
  return `T${Number(month)}`;
}

interface TooltipBodyProps {
  point: FinancePoint;
  granularity: FinanceGranularity;
}

export const FinanceTooltipBody: React.FC<TooltipBodyProps> = ({ point, granularity }) => (
  <div role="tooltip" className={styles.tooltip}>
    <span className={styles.tooltipTitle}>
      {granularity === 'day'
        ? formatPeriodLabel(point.period_start, 'day')
        : `${LABELS.month} ${Number(point.period_start.split('-')[1])}`}
    </span>
    <span className={styles.tooltipRow}>{LABELS.revenue}: {formatCompactVnd(point.revenue_vnd)}</span>
    <span className={styles.tooltipRow}>{LABELS.apiCost}: {formatCompactVnd(point.api_cost_vnd)}</span>
    <span className={styles.tooltipRow}>{LABELS.maintenance}: {formatCompactVnd(point.maintenance_cost_vnd)}</span>
    <span className={`${styles.tooltipRow} ${point.profit_vnd < 0 ? styles.negative : ''}`}>
      {LABELS.profit}: {formatCompactVnd(point.profit_vnd)}
    </span>
  </div>
);

export const FinanceTrendChart: React.FC<FinanceTrendChartProps> = ({
  points,
  granularity,
  height = 320,
  emptyHint,
  onShowLonger,
  showLongerLabel,
}) => {
  const hasData = points.some((p) => p.revenue_vnd !== 0 || p.profit_vnd !== 0 || p.api_cost_vnd !== 0);
  const tickInterval = points.length > DENSE_SERIES ? Math.ceil(points.length / MAX_X_LABELS) - 1 : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.swatchBar} />
          {LABELS.revenue}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchLine} />
          {LABELS.profit}
        </span>
        <span className={styles.unit}>{LABELS.unit}</span>
      </div>

      <div className={styles.chartArea} style={{ height }} role="img" aria-label={LABELS.ariaChart}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: INITIAL_WIDTH, height }}>
          <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--glass-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="period_start"
              tickFormatter={(v: string) => formatPeriodLabel(v, granularity)}
              interval={tickInterval}
              tickLine={TICK_LINE}
              tickSize={TICK_SIZE}
              axisLine={AXIS_LINE}
              tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
            />
            <YAxis
              width={56}
              tickFormatter={(v: number) => formatCompactVnd(v)}
              tickLine={TICK_LINE}
              tickSize={TICK_SIZE}
              axisLine={AXIS_LINE}
              tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
            />
            <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.2} />
            {hasData && (
              <Tooltip
                cursor={{ stroke: 'var(--glass-border)', strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <FinanceTooltipBody point={payload[0].payload as FinancePoint} granularity={granularity} />
                  ) : null
                }
              />
            )}
            <Area
              type="monotone"
              dataKey="revenue_vnd"
              name={LABELS.revenue}
              stroke={COLOR_REVENUE}
              strokeWidth={2.5}
              fillOpacity={AREA_FILL_OPACITY}
              fill={COLOR_REVENUE}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: COLOR_REVENUE, fill: 'var(--bg-secondary)' }}
              isAnimationActive={hasData}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="profit_vnd"
              name={LABELS.profit}
              stroke={COLOR_PROFIT}
              strokeWidth={2.5}
              dot={points.length <= DENSE_SERIES ? { r: 3, strokeWidth: 2, fill: 'var(--bg-secondary)' } : false}
              activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--bg-secondary)' }}
              isAnimationActive={hasData}
              animationDuration={600}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {!hasData && (
          <div className={styles.emptyOverlay}>
            <span className={styles.emptyTitle}>{LABELS.empty}</span>
            {emptyHint && <span className={styles.emptyHint}>{emptyHint}</span>}
            {onShowLonger && showLongerLabel && (
              <button type="button" className={styles.emptyAction} onClick={onShowLonger}>
                {showLongerLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
