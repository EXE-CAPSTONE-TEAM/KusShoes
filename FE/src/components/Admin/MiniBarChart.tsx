import React, { useState } from 'react';
import { calculateNiceTicks } from './MrrAreaChart';

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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const tickFormat = formatTick ?? formatValue;

  if (!points || points.length === 0) {
    return (
      <div
        style={{
          padding: '36px 0',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}
      >
        Chưa có dữ liệu.
      </div>
    );
  }

  const viewBoxWidth = 480;
  const viewBoxHeight = height;
  const paddingLeft = 46;
  const paddingRight = 12;
  const paddingTop = unitLabel ? 22 : 10;
  const paddingBottom = 26;
  const graphWidth = viewBoxWidth - paddingLeft - paddingRight;
  const graphHeight = viewBoxHeight - paddingTop - paddingBottom;
  const baselineY = paddingTop + graphHeight;

  const rawMax = Math.max(...points.map((p) => p.value), 1);
  const ticks = calculateNiceTicks(0, rawMax, 4);
  const yMax = ticks[ticks.length - 1] || 1;

  const getY = (val: number) => baselineY - Math.max(0, Math.min(1, val / yMax)) * graphHeight;

  const slotWidth = graphWidth / points.length;
  const barWidth = Math.min(38, Math.max(10, slotWidth * 0.5));

  const items = points.map((p, idx) => {
    const centerX = paddingLeft + (idx + 0.5) * slotWidth;
    const barY = getY(p.value);
    const barH = Math.max(p.value > 0 ? 2 : 0, baselineY - barY);
    return { ...p, index: idx, centerX, barY, barH };
  });

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        style={{ width: '100%', height }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {unitLabel && (
          <text
            x={paddingLeft}
            y={paddingTop - 8}
            textAnchor="start"
            fill="var(--text-secondary)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="var(--font-mono)"
          >
            {unitLabel}
          </text>
        )}

        {ticks.map((tickVal) => {
          const y = getY(tickVal);
          return (
            <g key={tickVal}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={viewBoxWidth - paddingRight}
                y2={y}
                stroke="var(--glass-border)"
                strokeDasharray="3 3"
                strokeWidth="1"
                opacity="0.8"
              />
              <line
                x1={paddingLeft - 4}
                y1={y}
                x2={paddingLeft}
                y2={y}
                stroke="var(--glass-border)"
                strokeWidth="1.2"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                fill="var(--text-secondary)"
                fontSize="9.5"
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {tickFormat(tickVal)}
              </text>
            </g>
          );
        })}

        <line
          x1={paddingLeft}
          y1={paddingTop - 4}
          x2={paddingLeft}
          y2={baselineY}
          stroke="var(--glass-border)"
          strokeWidth="1.5"
        />
        <line
          x1={paddingLeft}
          y1={baselineY}
          x2={viewBoxWidth - paddingRight}
          y2={baselineY}
          stroke="var(--glass-border)"
          strokeWidth="1.5"
        />

        {items.map((item) => {
          const isActive = hoverIndex === item.index;
          return (
            <g
              key={item.label}
              onMouseEnter={() => setHoverIndex(item.index)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={item.centerX - slotWidth / 2}
                y={paddingTop}
                width={slotWidth}
                height={graphHeight}
                fill="transparent"
              />
              {isActive && (
                <rect
                  x={item.centerX - slotWidth / 2 + 2}
                  y={paddingTop}
                  width={slotWidth - 4}
                  height={graphHeight}
                  fill="rgba(255,255,255,0.04)"
                />
              )}
              <rect
                x={item.centerX - barWidth / 2}
                y={item.barY}
                width={barWidth}
                height={item.barH}
                rx={1.5}
                fill={color}
                opacity={isActive ? 1 : 0.85}
              />
              {isActive && (
                <text
                  x={item.centerX}
                  y={Math.max(paddingTop + 10, item.barY - 5)}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                >
                  {formatValue(item.value)}
                </text>
              )}
              <line
                x1={item.centerX}
                y1={baselineY}
                x2={item.centerX}
                y2={baselineY + 4}
                stroke="var(--glass-border)"
                strokeWidth="1.2"
              />
              <text
                x={item.centerX}
                y={baselineY + 16}
                textAnchor="middle"
                fill={isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}
                fontSize="9.5"
                fontWeight={isActive ? '800' : '600'}
                fontFamily="var(--font-mono)"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
