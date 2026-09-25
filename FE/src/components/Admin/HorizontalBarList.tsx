import React from 'react';

interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Overrides the auto-computed bar width (0-1). Useful for a fixed "share" percentage. */
  fraction?: number;
  sub?: string;
  /** CSS color for the bar fill; defaults to the accent. */
  color?: string;
}

interface HorizontalBarListProps {
  items: BarItem[];
  formatValue: (v: number) => string;
  emptyLabel?: string;
}

export const HorizontalBarList: React.FC<HorizontalBarListProps> = ({ items, formatValue, emptyLabel }) => {
  if (items.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {emptyLabel ?? 'Không có dữ liệu đối soát.'}
      </div>
    );
  }
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item) => {
        const fraction = item.fraction ?? Math.abs(item.value) / max;
        const percentStr = item.sub ?? `${(fraction * 100).toFixed(1)}%`;
        const barColor = item.color ?? '#2563EB';

        return (
          <div
            key={item.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              minWidth: 0,
              padding: '4px 6px',
              borderRadius: 'var(--border-radius-sm)',
              transition: 'background-color var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: '0.80rem' }}>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
                title={item.label}
              >
                {item.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-admin, 'Roboto', sans-serif)",
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatValue(item.value)}
                </span>
                <span
                  style={{
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    padding: '1px 6px',
                    borderRadius: 'var(--border-radius-sm)',
                  }}
                >
                  {percentStr}
                </span>
              </div>
            </div>
            {/* Thanh tỷ trọng tài chính */}
            <div
              style={{
                height: 7,
                borderRadius: 3.5,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--glass-border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
                  background: barColor,
                  borderRadius: 2.5,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
