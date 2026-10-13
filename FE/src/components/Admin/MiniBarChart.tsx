import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, GRID_STROKE, INITIAL_CHART_WIDTH, Y_AXIS_WIDTH, calculateNiceTicks } from './chartUtils';
import common from './chartCommon.module.css';

interface MiniBarChartProps {
  points: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  formatTick?: (v: number) => string;
  unitLabel?: string;
  color?: string;
  height?: number;
}

/**
 * Biểu đồ cột thu gọn tuân theo Quy chuẩn Biểu đồ Tài chính (docs/ADMIN_DESIGN_SYSTEM.md §5):
 * trục Y bên trái với mốc chia tròn (Nice Numbers), lưới ngang nét đứt, trục X ở đáy.
 */
export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  points,
  formatValue = (v) => v.toLocaleString('vi-VN'),
  formatTick,
  unitLabel,
  color = 'var(--color-orange)',
  height = 200,
}) => {
  if (!points || points.length === 0) {
    return (
      <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Chưa có dữ liệu.
      </div>
    );
  }

  const tickFormat = formatTick ?? formatValue;
  const ticks = calculateNiceTicks(0, Math.max(...points.map((p) => p.value), 1), 4);

  return (
    <div>
      {unitLabel && <span className={common.unit}>{unitLabel}</span>}
      <div className={common.chartArea} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: INITIAL_CHART_WIDTH, height }}>
          <BarChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID_STROKE }} tick={AXIS_TICK} />
            <YAxis
              width={Y_AXIS_WIDTH}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={tickFormat}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <Tooltip
              cursor={{ fill: 'rgba(128, 128, 128, 0.08)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div role="tooltip" className={common.tooltip}>
                    <span className={common.tooltipTitle}>{String(payload[0].payload.label)}</span>
                    <span className={common.tooltipValue}>{formatValue(Number(payload[0].value))}</span>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={38} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
