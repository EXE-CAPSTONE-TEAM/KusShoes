import React from 'react';

interface MiniBarChartProps {
  points: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  color?: string;
  height?: number;
}

export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  points,
  formatValue = (v) => String(v),
  color = 'var(--color-orange)',
  height = 180,
}) => {
  const max = Math.max(...points.map(p => p.value), 1);
  const barWidth = 100 / points.length;

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, overflow: 'visible' }}
      >
        {points.map((p, i) => {
          const barHeight = (p.value / max) * (height - 24);
          const x = i * barWidth + barWidth * 0.2;
          const w = barWidth * 0.6;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={height - 24 - barHeight}
                width={w}
                height={barHeight}
                rx={1.5}
                fill={color}
                opacity={0.85}
              >
                <title>{`${p.label}: ${formatValue(p.value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', marginTop: 8 }}>
        {points.map((p) => (
          <div
            key={p.label}
            style={{
              width: `${barWidth}%`,
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
};
