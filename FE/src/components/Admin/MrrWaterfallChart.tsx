import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
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
} from './chartUtils';
import common from './chartCommon.module.css';
import styles from './MrrWaterfallChart.module.css';

export interface MrrMovementData {
  month: string;
  new: number;
  expansion: number;
  reactivation: number;
  contraction: number;
  churn: number;
  net_new: number;
}

interface MrrWaterfallChartProps {
  data: MrrMovementData;
  formatValue?: (v: number) => string;
  height?: number;
}

export type WaterfallStepType = 'positive' | 'negative' | 'total';

export interface WaterfallStep {
  id: string;
  label: string;
  /** Mức tích lũy trước / sau bước này. */
  start: number;
  end: number;
  delta: number;
  type: WaterfallStepType;
  /** [thấp, cao] của cột nổi — dạng range bar của Recharts. */
  range: [number, number];
}

const COLOR_POSITIVE = '#10B981';
const COLOR_NEGATIVE = '#EF4444';
const COLOR_TOTAL = '#2563EB';
// Sàn trục Y để biểu đồ không bị dẹt khi mọi biến động đều bằng 0.
const MIN_AXIS_MAX = 1000;

/** Dựng 6 bước cầu MRR: 3 bước cộng, 2 bước trừ, rồi Net New tính từ 0. */
export function buildWaterfallSteps(data: MrrMovementData): WaterfallStep[] {
  const defs: { id: string; label: string; delta: number; type: WaterfallStepType }[] = [
    { id: 'new', label: 'Khách mới', delta: Math.abs(data.new), type: 'positive' },
    { id: 'exp', label: 'Nâng gói', delta: Math.abs(data.expansion), type: 'positive' },
    { id: 'react', label: 'Kích hoạt', delta: Math.abs(data.reactivation), type: 'positive' },
    { id: 'contr', label: 'Hạ gói', delta: -Math.abs(data.contraction), type: 'negative' },
    { id: 'churn', label: 'Rời bỏ', delta: -Math.abs(data.churn), type: 'negative' },
  ];
  let balance = 0;
  const steps: WaterfallStep[] = defs.map((d) => {
    const start = balance;
    const end = start + d.delta;
    balance = end;
    return { ...d, start, end, range: [Math.min(start, end), Math.max(start, end)] };
  });
  steps.push({
    id: 'net',
    label: 'Net New',
    start: 0,
    end: data.net_new,
    delta: data.net_new,
    type: 'total',
    range: [Math.min(0, data.net_new), Math.max(0, data.net_new)],
  });
  return steps;
}

const stepColor = (s: WaterfallStep) =>
  s.type === 'positive' ? COLOR_POSITIVE : s.type === 'negative' ? COLOR_NEGATIVE : s.delta >= 0 ? COLOR_TOTAL : COLOR_NEGATIVE;

export const MrrWaterfallChart: React.FC<MrrWaterfallChartProps> = ({
  data,
  formatValue = (v) => `${v.toLocaleString('vi-VN')} VNĐ`,
  height = 200,
}) => {
  const view = useMemo(() => {
    const steps = buildWaterfallSteps(data);
    const inflow = Math.abs(data.new) + Math.abs(data.expansion) + Math.abs(data.reactivation);
    const outflow = Math.abs(data.contraction) + Math.abs(data.churn);
    const levels = steps.flatMap((s) => s.range);
    const ticks = calculateNiceTicks(Math.min(0, ...levels), Math.max(MIN_AXIS_MAX, ...levels), 4);
    return { steps, inflow, outflow, ticks, isNetPositive: data.net_new >= 0 };
  }, [data]);

  const { steps, inflow, outflow, ticks, isNetPositive } = view;

  const renderDelta = (props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }) => {
    const step = steps[props.index ?? -1];
    if (!step) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    const top = Math.min(Number(props.y), Number(props.y) + Number(props.height));
    const bottom = Math.max(Number(props.y), Number(props.y) + Number(props.height));
    return (
      <text x={x} y={step.delta >= 0 ? top - 5 : bottom + 11} textAnchor="middle" className={common.valueLabel}>
        {step.delta > 0 ? '+' : ''}
        {formatCompactVnd(step.delta)}
      </text>
    );
  };

  return (
    <div className={styles.container}>
      {/* 1. Dải đối soát tài chính tóm tắt */}
      <div className={styles.summaryStrip}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Dòng tiền vào (+)</span>
          <span className={styles.summaryValInflow}>+{formatValue(inflow)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Dòng tiền ra (-)</span>
          <span className={styles.summaryValOutflow}>-{formatValue(outflow)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Net New (Tháng {data.month})</span>
          <span className={`${styles.summaryValNet} ${isNetPositive ? styles.summaryValNetPositive : styles.summaryValNetNegative}`}>
            {data.net_new > 0 ? '+' : ''}{formatValue(data.net_new)}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Khả năng bù đắp</span>
          <span className={styles.summaryValCoverage}>
            {outflow === 0 ? '100% (An toàn)' : `${Math.min(999, Math.round((inflow / outflow) * 100))}%`}
          </span>
        </div>
      </div>

      {/* 2. Biểu đồ thác nước (Recharts range bar) */}
      <span className={common.unit}>(Đơn vị: VNĐ)</span>
      <div className={common.chartArea} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: INITIAL_CHART_WIDTH, height }}>
          <ComposedChart data={steps} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              tick={AXIS_TICK}
              interval={0}
            />
            <YAxis
              width={Y_AXIS_WIDTH}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={formatCompactVnd}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.2} />
            {/* Đường dóng nối mức tích lũy giữa các bậc */}
            {steps.slice(0, -1).map((s, i) => (
              <ReferenceLine
                key={s.id}
                segment={[
                  { x: s.label, y: s.end },
                  { x: steps[i + 1].label, y: s.end },
                ]}
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
              />
            ))}
            <Tooltip
              cursor={{ fill: 'rgba(128, 128, 128, 0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as WaterfallStep;
                return (
                  <div role="tooltip" className={common.tooltip}>
                    <span className={common.tooltipTitle}>{s.label}</span>
                    <span
                      className={common.tooltipValue}
                      style={{ color: s.delta > 0 ? COLOR_POSITIVE : s.delta < 0 ? COLOR_NEGATIVE : undefined }}
                    >
                      {s.delta > 0 ? '+' : ''}{formatValue(s.delta)}
                    </span>
                    <span className={common.tooltipSub}>
                      {s.type === 'total'
                        ? `Biến động ròng cuối kỳ: ${formatValue(s.end)}`
                        : `Mức tích lũy: ${formatValue(s.end)}`}
                    </span>
                  </div>
                );
              }}
            />
            <Bar dataKey="range" radius={[3, 3, 3, 3]} maxBarSize={38} minPointSize={2}>
              {steps.map((s) => (
                <Cell key={s.id} fill={stepColor(s)} />
              ))}
              <LabelList dataKey="range" content={renderDelta} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
