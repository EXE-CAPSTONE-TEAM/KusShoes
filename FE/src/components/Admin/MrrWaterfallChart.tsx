import React, { useMemo, useState } from 'react';
import { formatCompactVnd } from './MrrAreaChart';
import styles from './MrrWaterfallChart.module.css';

interface MrrMovementData {
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
}

/**
 * Tính toán các mốc chia tròn số đẹp cho trục Y (Wilkinson / Nice Numbers)
 */
function calculateNiceTicks(min: number, max: number, targetCount = 4): number[] {
  if (max <= min) return [min, min + 1];
  const span = max - min;
  const rawStep = span / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / magnitude;

  let niceStep = magnitude;
  if (frac > 5) niceStep = 10 * magnitude;
  else if (frac > 2) niceStep = 5 * magnitude;
  else if (frac > 1) niceStep = 2 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v));
  }
  return ticks;
}

export const MrrWaterfallChart: React.FC<MrrWaterfallChartProps> = ({
  data,
  formatValue = (v) => `${v.toLocaleString('vi-VN')} VNĐ`,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // 1. Phân tích các bước luân chuyển dòng tiền kế toán (MRR Bridge)
  const stepsData = useMemo(() => {
    const valNew = Math.abs(data.new);
    const valExp = Math.abs(data.expansion);
    const valReact = Math.abs(data.reactivation);
    const valContr = Math.abs(data.contraction);
    const valChurn = Math.abs(data.churn);

    const inflow = valNew + valExp + valReact;
    const outflow = valContr + valChurn;
    const isNetPositive = data.net_new >= 0;

    let balance = 0;

    // Bước 1: Mới (+)
    const s1Start = balance;
    const s1End = s1Start + valNew;
    balance = s1End;

    // Bước 2: Nâng gói (+)
    const s2Start = balance;
    const s2End = s2Start + valExp;
    balance = s2End;

    // Bước 3: Kích hoạt lại (+)
    const s3Start = balance;
    const s3End = s3Start + valReact;
    balance = s3End;

    // Bước 4: Hạ gói (-)
    const s4Start = balance;
    const s4End = s4Start - valContr;
    balance = s4End;

    // Bước 5: Rời bỏ (-)
    const s5Start = balance;
    const s5End = s5Start - valChurn;
    balance = s5End;

    // Bước 6: Net New (Ròng) - Từ 0 đến giá trị ròng cuối cùng
    const s6Start = 0;
    const s6End = data.net_new;

    const steps = [
      { id: 'new', label: 'Khách mới', start: s1Start, end: s1End, delta: valNew, type: 'positive' as const },
      { id: 'exp', label: 'Nâng gói', start: s2Start, end: s2End, delta: valExp, type: 'positive' as const },
      { id: 'react', label: 'Kích hoạt', start: s3Start, end: s3End, delta: valReact, type: 'positive' as const },
      { id: 'contr', label: 'Hạ gói', start: s4Start, end: s4End, delta: -valContr, type: 'negative' as const },
      { id: 'churn', label: 'Rời bỏ', start: s5Start, end: s5End, delta: -valChurn, type: 'negative' as const },
      { id: 'net', label: 'Net New', start: s6Start, end: s6End, delta: data.net_new, type: 'total' as const },
    ];

    const allValues = [0, s1Start, s1End, s2End, s3End, s4End, s5End, s6End];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues, 1000);

    return {
      inflow,
      outflow,
      isNetPositive,
      steps,
      minVal,
      maxVal,
    };
  }, [data]);

  // Tọa độ và kích thước khung vẽ
  const viewBoxWidth = 720;
  const viewBoxHeight = 200;
  const paddingLeft = 68; // Không gian cho nhãn trục Y
  const paddingRight = 24;
  const paddingTop = 26;  // Không gian cho nhãn đơn vị
  const paddingBottom = 32; // Không gian cho nhãn trục X
  const graphWidth = viewBoxWidth - paddingLeft - paddingRight;
  const graphHeight = viewBoxHeight - paddingTop - paddingBottom;

  // Thang đo trục Y
  const ticks = calculateNiceTicks(stepsData.minVal, stepsData.maxVal, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const getY = (val: number) => {
    if (yMax === yMin) return paddingTop + graphHeight;
    const ratio = (val - yMin) / (yMax - yMin);
    return paddingTop + graphHeight - ratio * graphHeight;
  };

  const zeroY = getY(0);
  const baselineY = paddingTop + graphHeight;

  // Tọa độ các cột thác nước
  const slotCount = stepsData.steps.length;
  const slotWidth = graphWidth / slotCount;
  const barWidth = Math.min(38, Math.max(14, slotWidth * 0.52));

  const items = stepsData.steps.map((step, idx) => {
    const centerX = paddingLeft + (idx + 0.5) * slotWidth;
    const barX = centerX - barWidth / 2;
    const topVal = Math.max(step.start, step.end);
    const botVal = Math.min(step.start, step.end);
    const barY = getY(topVal);
    const barH = Math.max(step.delta !== 0 ? 3 : 1.5, getY(botVal) - getY(topVal));

    return {
      ...step,
      index: idx,
      centerX,
      barX,
      barY,
      barH,
    };
  });

  const activeItem = hoverIndex !== null ? items[hoverIndex] : null;

  return (
    <div className={styles.container}>
      {/* 1. Dải đối soát tài chính tóm tắt */}
      <div className={styles.summaryStrip}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Dòng tiền vào (+)</span>
          <span className={styles.summaryValInflow}>+{formatValue(stepsData.inflow)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Dòng tiền ra (-)</span>
          <span className={styles.summaryValOutflow}>-{formatValue(stepsData.outflow)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Net New (Tháng {data.month})</span>
          <span className={`${styles.summaryValNet} ${stepsData.isNetPositive ? styles.summaryValNetPositive : styles.summaryValNetNegative}`}>
            {data.net_new > 0 ? '+' : ''}{formatValue(data.net_new)}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Khả năng bù đắp</span>
          <span className={styles.summaryValCoverage}>
            {stepsData.outflow === 0 ? '100% (An toàn)' : `${Math.min(999, Math.round((stepsData.inflow / stepsData.outflow) * 100))}%`}
          </span>
        </div>
      </div>

      {/* 2. Biểu đồ Thác Nước Tài Chính (Financial Waterfall SVG) */}
      <div className={styles.svgWrapper}>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className={styles.svgChart}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Nhãn đơn vị tiền tệ trên đỉnh trục Y */}
          <text
            x={paddingLeft}
            y={paddingTop - 10}
            textAnchor="start"
            fill="var(--text-secondary)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="var(--font-mono)"
          >
            (Đơn vị: VNĐ)
          </text>

          {/* Các mốc và đường lưới ngang trục Y */}
          {ticks.map((tickVal) => {
            const y = getY(tickVal);
            const isZero = tickVal === 0;
            return (
              <g key={tickVal}>
                {/* Đường lưới ngang */}
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={viewBoxWidth - paddingRight}
                  y2={y}
                  stroke={isZero ? 'var(--text-secondary)' : 'var(--glass-border)'}
                  strokeDasharray={isZero ? undefined : '3 3'}
                  strokeWidth={isZero ? '1.5' : '1'}
                  opacity={isZero ? 0.9 : 0.75}
                />
                {/* Vạch chia trục Y */}
                <line
                  x1={paddingLeft - 4}
                  y1={y}
                  x2={paddingLeft}
                  y2={y}
                  stroke="var(--glass-border)"
                  strokeWidth="1.2"
                />
                {/* Nhãn tiền tệ trục Y */}
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={isZero ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  fontSize="9.5"
                  fontWeight={isZero ? '700' : '600'}
                  fontFamily="var(--font-mono)"
                >
                  {formatCompactVnd(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Đường trục tung Y bên trái */}
          <line
            x1={paddingLeft}
            y1={paddingTop - 4}
            x2={paddingLeft}
            y2={baselineY}
            stroke="var(--glass-border)"
            strokeWidth="1.5"
          />

          {/* Đường trục hoành đáy X */}
          <line
            x1={paddingLeft}
            y1={baselineY}
            x2={viewBoxWidth - paddingRight}
            y2={baselineY}
            stroke="var(--glass-border)"
            strokeWidth="1.5"
          />

          {/* Đường số 0 phân tách âm dương nếu miền giá trị có số âm */}
          {yMin < 0 && (
            <line
              x1={paddingLeft}
              y1={zeroY}
              x2={viewBoxWidth - paddingRight}
              y2={zeroY}
              stroke="var(--text-secondary)"
              strokeWidth="1.5"
            />
          )}

          {/* Đường dóng nối các bậc thác nước (Waterfall Connectors) */}
          {items.map((item, idx) => {
            if (idx >= items.length - 1) return null;
            const nextItem = items[idx + 1];
            const connY = getY(item.end);
            return (
              <line
                key={`conn-${item.id}`}
                x1={item.barX + barWidth}
                y1={connY}
                x2={nextItem.barX}
                y2={connY}
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
                strokeWidth="1.2"
                opacity="0.85"
              />
            );
          })}

          {/* Các cột thác nước (Floating Waterfall Bars) */}
          {items.map((item) => {
            const isActive = hoverIndex === item.index;

            // Màu sắc kế toán chuẩn
            let fillColor = '#10B981';
            let strokeColor = '#059669';
            if (item.type === 'negative') {
              fillColor = '#EF4444';
              strokeColor = '#DC2626';
            } else if (item.type === 'total') {
              fillColor = item.delta >= 0 ? '#2563EB' : '#EF4444';
              strokeColor = item.delta >= 0 ? '#1D4ED8' : '#DC2626';
            }

            return (
              <g
                key={item.id}
                onMouseEnter={() => setHoverIndex(item.index)}
                style={{ cursor: 'pointer' }}
              >
                {/* Vùng bắt chuột rộng */}
                <rect
                  x={item.centerX - slotWidth / 2}
                  y={paddingTop}
                  width={slotWidth}
                  height={graphHeight}
                  fill="transparent"
                />

                {/* Vệt hover */}
                {isActive && (
                  <rect
                    x={item.centerX - slotWidth / 2 + 2}
                    y={paddingTop}
                    width={slotWidth - 4}
                    height={graphHeight}
                    fill="rgba(255, 255, 255, 0.04)"
                  />
                )}

                {/* Cột dữ liệu thác nước */}
                <rect
                  x={item.barX}
                  y={item.barY}
                  width={barWidth}
                  height={item.barH}
                  rx={2}
                  ry={2}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={1}
                  opacity={isActive ? 1 : 0.88}
                />

                {/* Nhãn giá trị trực tiếp trên/dưới cột */}
                <text
                  x={item.centerX}
                  y={item.delta >= 0 ? Math.max(paddingTop + 10, item.barY - 5) : Math.min(baselineY - 5, item.barY + item.barH + 11)}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                >
                  {item.delta > 0 ? '+' : ''}{formatCompactVnd(item.delta)}
                </text>

                {/* Vạch chia nhỏ dưới trục hoành */}
                <line
                  x1={item.centerX}
                  y1={baselineY}
                  x2={item.centerX}
                  y2={baselineY + 4}
                  stroke="var(--glass-border)"
                  strokeWidth="1.2"
                />

                {/* Nhãn tên bước dưới trục X */}
                <text
                  x={item.centerX}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fill={isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  fontSize="10"
                  fontWeight={isActive ? '800' : '600'}
                  fontFamily="var(--font-admin, 'Roboto', sans-serif)"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip đối soát tài chính */}
        {activeItem && (
          <div
            className={styles.tooltipBox}
            style={{
              left: `${(activeItem.centerX / viewBoxWidth) * 100}%`,
              top: `${(activeItem.barY / viewBoxHeight) * 100}%`,
            }}
          >
            <span className={styles.tooltipTitle}>{activeItem.label}</span>
            <span
              className={styles.tooltipValue}
              style={{
                color: activeItem.delta > 0 ? '#10B981' : activeItem.delta < 0 ? '#EF4444' : 'var(--text-primary)',
              }}
            >
              {activeItem.delta > 0 ? '+' : ''}{formatValue(activeItem.delta)}
            </span>
            <span className={styles.tooltipSub}>
              {activeItem.type === 'total'
                ? `Biến động ròng cuối kỳ: ${formatValue(activeItem.end)}`
                : `Mức tích lũy: ${formatValue(activeItem.end)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
