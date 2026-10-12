import React, { useState } from 'react';
import type { FinancePoint } from '../../types/admin';
import { calculateNiceTicks, formatCompactVnd } from './MrrAreaChart';
import styles from './FinanceTrendChart.module.css';

export type FinanceGranularity = 'day' | 'month';

interface FinanceTrendChartProps {
  points: FinancePoint[];
  granularity: FinanceGranularity;
  height?: number;
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

const VIEW_WIDTH = 720;
const PAD = { left: 68, right: 24, top: 26, bottom: 32 };

/** period_start là yyyy-MM-dd; tách chuỗi để tránh lệch múi giờ khi parse Date. */
export function formatPeriodLabel(periodStart: string, granularity: FinanceGranularity): string {
  const [, month, day] = periodStart.split('-');
  if (granularity === 'day') return `${day}/${month}`;
  return `T${Number(month)}`;
}

export const FinanceTrendChart: React.FC<FinanceTrendChartProps> = ({ points, granularity, height = 320 }) => {
  const [hover, setHover] = useState<number | null>(null);

  const hasData = points.some((p) => p.revenue_vnd !== 0 || p.profit_vnd !== 0 || p.api_cost_vnd !== 0);
  if (!hasData) return <div className={styles.empty}>{LABELS.empty}</div>;

  const graphW = VIEW_WIDTH - PAD.left - PAD.right;
  const graphH = height - PAD.top - PAD.bottom;
  const maxVal = Math.max(...points.map((p) => Math.max(p.revenue_vnd, p.profit_vnd)), 1);
  const minVal = Math.min(0, ...points.map((p) => p.profit_vnd));
  const ticks = calculateNiceTicks(minVal, maxVal, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const getY = (v: number) => {
    if (yMax === yMin) return PAD.top + graphH;
    return PAD.top + graphH - ((v - yMin) / (yMax - yMin)) * graphH;
  };
  const zeroY = getY(0);

  const slotW = graphW / points.length;
  const barW = Math.min(38, Math.max(4, slotW * 0.6));
  const items = points.map((p, i) => ({ ...p, cx: PAD.left + (i + 0.5) * slotW }));
  const linePath = items
    .map((it, i) => `${i === 0 ? 'M' : 'L'} ${it.cx.toFixed(1)} ${getY(it.profit_vnd).toFixed(1)}`)
    .join(' ');
  // Với chuỗi ngày (30 điểm), chỉ in nhãn thưa để không chồng chữ.
  const labelEvery = points.length > 12 ? Math.ceil(points.length / 8) : 1;
  const active = hover !== null ? items[hover] : null;

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
      </div>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className={styles.svg}
        role="img"
        aria-label={LABELS.ariaChart}
        onMouseLeave={() => setHover(null)}
      >
        <text x={PAD.left} y={PAD.top - 10} fill="var(--text-secondary)" fontSize="9.5" fontWeight="700" fontFamily="var(--font-mono)">
          {LABELS.unit}
        </text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} y1={getY(t)} x2={VIEW_WIDTH - PAD.right} y2={getY(t)} stroke="var(--glass-border)" strokeDasharray="3 3" opacity="0.8" />
            <text x={PAD.left - 8} y={getY(t) + 3.5} textAnchor="end" fill="var(--text-secondary)" fontSize="9.5" fontWeight="600" fontFamily="var(--font-mono)">
              {formatCompactVnd(t)}
            </text>
          </g>
        ))}
        <line data-testid="zero-baseline" x1={PAD.left} y1={zeroY} x2={VIEW_WIDTH - PAD.right} y2={zeroY} stroke="var(--text-secondary)" strokeWidth="1.5" />
        <line x1={PAD.left} y1={PAD.top - 4} x2={PAD.left} y2={PAD.top + graphH} stroke="var(--glass-border)" strokeWidth="1.5" />

        {items.map((it, i) => {
          const y = getY(it.revenue_vnd);
          return (
            <g key={it.period_start} data-testid="finance-slot" onMouseEnter={() => setHover(i)}>
              <rect x={it.cx - slotW / 2} y={PAD.top} width={slotW} height={graphH} fill={hover === i ? 'rgba(128,128,128,0.10)' : 'transparent'} />
              <rect
                data-testid="revenue-bar"
                x={it.cx - barW / 2}
                y={Math.min(y, zeroY)}
                width={barW}
                height={Math.abs(zeroY - y)}
                rx={2}
                fill="var(--color-orange)"
                opacity={hover === i ? 1 : 0.85}
              />
              {i % labelEvery === 0 && (
                <text x={it.cx} y={PAD.top + graphH + 16} textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
                  {formatPeriodLabel(it.period_start, granularity)}
                </text>
              )}
            </g>
          );
        })}

        <path data-testid="profit-line" d={linePath} fill="none" stroke="var(--status-scanned)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {items.map((it, i) => (
          <circle key={it.period_start} cx={it.cx} cy={getY(it.profit_vnd)} r={hover === i ? 5 : 3} fill="var(--bg-secondary)" stroke="var(--status-scanned)" strokeWidth="2" />
        ))}
      </svg>

      {active && (
        <div
          role="tooltip"
          className={styles.tooltip}
          style={{
            left: `${(active.cx / VIEW_WIDTH) * 100}%`,
            top: `${(Math.min(getY(active.revenue_vnd), getY(active.profit_vnd)) / height) * 100}%`,
          }}
        >
          <span className={styles.tooltipTitle}>
            {granularity === 'day'
              ? formatPeriodLabel(active.period_start, 'day')
              : `${LABELS.month} ${Number(active.period_start.split('-')[1])}`}
          </span>
          <span className={styles.tooltipRow}>{LABELS.revenue}: {formatCompactVnd(active.revenue_vnd)}</span>
          <span className={styles.tooltipRow}>{LABELS.apiCost}: {formatCompactVnd(active.api_cost_vnd)}</span>
          <span className={styles.tooltipRow}>{LABELS.maintenance}: {formatCompactVnd(active.maintenance_cost_vnd)}</span>
          <span className={`${styles.tooltipRow} ${active.profit_vnd < 0 ? styles.negative : ''}`}>
            {LABELS.profit}: {formatCompactVnd(active.profit_vnd)}
          </span>
        </div>
      )}
    </div>
  );
};
