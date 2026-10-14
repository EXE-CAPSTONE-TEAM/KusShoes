import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS_TICK,
  GRID_STROKE,
  INITIAL_CHART_WIDTH,
  Y_AXIS_WIDTH,
  calculateNiceTicks,
  formatCompactVnd,
  AXIS_LINE,
  FIN_AMBER,
  FIN_BLUE,
  FIN_GREEN,
  FIN_RED,
  TICK_LINE,
  TICK_SIZE,
} from './chartUtils';
import common from './chartCommon.module.css';
import styles from './MrrAreaChart.module.css';

interface Point {
  label: string;
  value: number;
}

interface MrrAreaChartProps {
  points: Point[];
  formatValue?: (v: number) => string;
  color?: string;
  height?: number;
  subLabel?: string;
}

const COLOR_AVG = FIN_AMBER;
const COLOR_ACTIVE = FIN_BLUE;
const COLOR_UP = FIN_GREEN;
const COLOR_DOWN = FIN_RED;
// DS §1: không gradient trang trí — vùng dưới đường chỉ là mảng phẳng mờ.
const AREA_FILL_OPACITY = 0.12;
// Chỉ in nhãn giá trị trên cột cao nhất khi ít cột, tránh chồng chữ.
const MAX_LABELLED_BARS = 8;

interface Datum extends Point {
  momChange: number | null;
}

export const MrrAreaChart: React.FC<MrrAreaChartProps> = ({
  points,
  formatValue = (v) => `${v.toLocaleString('vi-VN')} VNĐ`,
  color = FIN_BLUE,
  height = 200,
}) => {
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');

  // Tính toán các chỉ số thống kê tài chính
  const stats = useMemo(() => {
    if (!points || points.length === 0) return null;
    const values = points.map((p) => p.value);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = Math.round(total / values.length);
    let maxIdx = 0;
    let minIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxIdx]) maxIdx = i;
      if (values[i] < values[minIdx]) minIdx = i;
    }
    return { total, avg, maxIdx, maxPoint: points[maxIdx], minPoint: points[minIdx] };
  }, [points]);

  const data: Datum[] = useMemo(
    () =>
      (points ?? []).map((p, i) => {
        const prev = i > 0 ? points[i - 1].value : null;
        return { ...p, momChange: prev !== null && prev > 0 ? ((p.value - prev) / prev) * 100 : null };
      }),
    [points],
  );

  if (!stats) {
    return (
      <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Chưa có dữ liệu phân tích doanh thu.
      </div>
    );
  }

  const ticks = calculateNiceTicks(0, Math.max(...points.map((p) => p.value), 1), 4);
  const yDomain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const showMaxLabel = points.length <= MAX_LABELLED_BARS;

  const renderMaxLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    if (!showMaxLabel || props.index !== stats.maxIdx || stats.maxPoint.value <= 0) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    return (
      <text x={x} y={Number(props.y) - 5} textAnchor="middle" className={common.valueLabel}>
        {formatCompactVnd(stats.maxPoint.value)}
      </text>
    );
  };

  return (
    <div className={styles.container}>
      {/* 1. Thanh tóm tắt các chỉ số tài chính cốt lõi */}
      <div className={styles.statStrip}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Tổng kỳ ({points.length} tháng)</span>
          <span className={styles.statValue}>{formatValue(stats.total)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Bình quân tháng</span>
          <span className={styles.statValue}>{formatValue(stats.avg)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Đạt đỉnh (T{stats.maxPoint.label})</span>
          <span className={styles.statValue}>{formatValue(stats.maxPoint.value)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Thấp nhất (T{stats.minPoint.label})</span>
          <span className={styles.statValue}>{formatValue(stats.minPoint.value)}</span>
        </div>
      </div>

      {/* 2. Chuyển chế độ xem (Cột tài chính vs Đường xu hướng) */}
      <div className={styles.chartControls}>
        <div className={styles.modeToggleGroup}>
          <button
            type="button"
            className={`${styles.modeBtn} ${chartMode === 'bar' ? styles.modeBtnActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setChartMode('bar');
            }}
            title="Biểu đồ cột chuẩn báo cáo tài chính"
          >
            Cột tài chính
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${chartMode === 'line' ? styles.modeBtnActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setChartMode('line');
            }}
            title="Biểu đồ đường xu hướng"
          >
            Đường xu hướng
          </button>
        </div>
      </div>

      {/* 3. Biểu đồ Recharts */}
      <span className={common.unit}>(Đơn vị: VNĐ)</span>
      <div className={common.chartArea} style={{ height }} onClick={(e) => e.stopPropagation()}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: INITIAL_CHART_WIDTH, height }}>
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickFormatter={(v: string) => `T${v}`}
              tickLine={TICK_LINE}
              tickSize={TICK_SIZE}
              axisLine={AXIS_LINE}
              tick={AXIS_TICK}
            />
            <YAxis
              width={Y_AXIS_WIDTH}
              domain={yDomain}
              ticks={ticks}
              tickFormatter={formatCompactVnd}
              tickLine={TICK_LINE}
              tickSize={TICK_SIZE}
              axisLine={AXIS_LINE}
              tick={AXIS_TICK}
            />
            <ReferenceLine
              y={stats.avg}
              stroke={COLOR_AVG}
              strokeDasharray="4 3"
              label={{
                value: `TB: ${formatCompactVnd(stats.avg)}`,
                position: 'insideTopRight',
                fill: COLOR_AVG,
                fontSize: 9,
                fontWeight: 700,
              }}
            />
            <Tooltip
              cursor={chartMode === 'bar' ? { fill: 'var(--hover-bg-item)' } : { stroke: GRID_STROKE }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Datum;
                const vsAvg = ((d.value - stats.avg) / Math.max(stats.avg, 1)) * 100;
                return (
                  <div role="tooltip" className={common.tooltip}>
                    <span className={common.tooltipTitle}>Tháng {d.label}</span>
                    <span className={common.tooltipValue}>{formatValue(d.value)}</span>
                    <span className={common.tooltipSub}>
                      {d.value >= stats.avg ? '+' : ''}
                      {vsAvg.toFixed(1)}% so với trung bình
                    </span>
                    {d.momChange !== null && (
                      <span className={common.tooltipSub} style={{ color: d.momChange >= 0 ? COLOR_UP : COLOR_DOWN }}>
                        {d.momChange >= 0 ? '▲ +' : '▼ '}
                        {d.momChange.toFixed(1)}% so với tháng trước
                      </span>
                    )}
                  </div>
                );
              }}
            />
            {chartMode === 'bar' ? (
              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={38} activeBar={{ fill: COLOR_ACTIVE }}>
                <LabelList dataKey="value" content={renderMaxLabel} />
              </Bar>
            ) : (
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                fillOpacity={AREA_FILL_OPACITY}
                fill={color}
                dot={{ r: 3.5, strokeWidth: 2, stroke: color, fill: 'var(--bg-secondary)' }}
                activeDot={{ r: 5, strokeWidth: 2.5, stroke: COLOR_ACTIVE, fill: 'var(--bg-secondary)' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
