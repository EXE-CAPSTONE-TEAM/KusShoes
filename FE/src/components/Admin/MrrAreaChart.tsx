import React, { useMemo, useState } from 'react';
import styles from './MrrAreaChart.module.css';

interface Point {
  label: string;
  value: number;
}

interface MrrAreaChartProps {
  points: Point[];
  formatValue?: (v: number) => string;
  color?: string;
  gradientId?: string;
  height?: number;
  subLabel?: string;
}

/**
 * Định dạng tiền tệ rút gọn chuẩn trục tài chính (VNĐ):
 * 15.000.000 -> 15 tr, 500.000 -> 500k, 1.200.000.000 -> 1.2 tỷ
 */
export function formatCompactVnd(v: number): string {
  if (v === 0) return '0 đ';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    const val = abs / 1_000_000_000;
    return `${sign}${val >= 10 ? Math.round(val) : val.toFixed(1)} tỷ`;
  }
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}${val >= 10 ? Math.round(val) : val.toFixed(1)} tr`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}${Math.round(val)}k`;
  }
  return `${sign}${abs.toLocaleString('vi-VN')} đ`;
}

/**
 * Tính toán các mốc chia tròn số đẹp cho trục Y (Wilkinson / Nice Numbers Algorithm)
 */
export function calculateNiceTicks(min: number, max: number, targetCount = 4): number[] {
  if (max <= min) return [0, Math.max(min, 1)];
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

export const MrrAreaChart: React.FC<MrrAreaChartProps> = ({
  points,
  formatValue = (v) => `${v.toLocaleString('vi-VN')} VNĐ`,
  color = '#2563EB',
  height = 200,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
    return {
      total,
      avg,
      maxPoint: points[maxIdx],
      minPoint: points[minIdx],
    };
  }, [points]);

  if (!points || points.length === 0) {
    return (
      <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Chưa có dữ liệu phân tích doanh thu.
      </div>
    );
  }

  // Tọa độ và kích thước khung vẽ
  const viewBoxWidth = 720;
  const viewBoxHeight = height;
  const paddingLeft = 68; // Không gian cho nhãn trục Y
  const paddingRight = 24;
  const paddingTop = 26;  // Không gian cho nhãn đơn vị (VNĐ)
  const paddingBottom = 32; // Không gian cho nhãn trục X
  const graphWidth = viewBoxWidth - paddingLeft - paddingRight;
  const graphHeight = viewBoxHeight - paddingTop - paddingBottom;
  const baselineY = paddingTop + graphHeight;

  // Thang đo trục Y
  const rawMax = Math.max(...points.map((p) => p.value), 1);
  const ticks = calculateNiceTicks(0, rawMax, 4);
  const yMax = ticks[ticks.length - 1];
  const yMin = 0;

  const getY = (val: number) => {
    if (yMax === yMin) return baselineY;
    const ratio = Math.max(0, Math.min(1, (val - yMin) / (yMax - yMin)));
    return baselineY - ratio * graphHeight;
  };

  // Tọa độ các điểm trên trục X
  const slotCount = points.length;
  const slotWidth = graphWidth / Math.max(slotCount, 1);
  const barWidth = Math.min(38, Math.max(14, slotWidth * 0.52));

  const items = points.map((p, idx) => {
    const centerX = paddingLeft + (idx + 0.5) * slotWidth;
    const barX = centerX - barWidth / 2;
    const yVal = getY(p.value);
    const barH = Math.max(p.value > 0 ? 3 : 1, baselineY - yVal);
    const prevVal = idx > 0 ? points[idx - 1].value : null;
    const momChange = prevVal !== null && prevVal > 0 ? ((p.value - prevVal) / prevVal) * 100 : null;

    return {
      ...p,
      index: idx,
      centerX,
      barX,
      barY: yVal,
      barH,
      momChange,
    };
  });

  const avgY = stats ? getY(stats.avg) : baselineY;
  const activeItem = hoverIndex !== null ? items[hoverIndex] : null;

  // Tạo path cho dạng đường thẳng (Financial Straight Line)
  const linePath = items.length > 0
    ? items.reduce((path, item, i) => `${path} ${i === 0 ? 'M' : 'L'} ${item.centerX.toFixed(1)} ${item.barY.toFixed(1)}`, '')
    : '';

  return (
    <div className={styles.container}>
      {/* 1. Thanh tóm tắt các chỉ số tài chính cốt lõi */}
      {stats && (
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
      )}

      {/* 2. Thanh chuyển đổi chế độ xem (Cột tài chính vs Đường xu hướng) */}
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

      {/* 3. Khung vẽ SVG chuẩn trục tài chính */}
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

          {/* Các mốc và đường lưới ngang trục Y (Horizontal Grid Lines & Ticks) */}
          {ticks.map((tickVal) => {
            const y = getY(tickVal);
            return (
              <g key={tickVal}>
                {/* Đường lưới ngang nét đứt mỏng */}
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
                {/* Vạch chia nhỏ trên trục Y */}
                <line
                  x1={paddingLeft - 4}
                  y1={y}
                  x2={paddingLeft}
                  y2={y}
                  stroke="var(--glass-border)"
                  strokeWidth="1.2"
                />
                {/* Nhãn số liệu trục Y căn phải */}
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                >
                  {formatCompactVnd(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Đường trục tung Y (Vertical Left Y-Axis) */}
          <line
            x1={paddingLeft}
            y1={paddingTop - 4}
            x2={paddingLeft}
            y2={baselineY}
            stroke="var(--glass-border)"
            strokeWidth="1.5"
          />

          {/* Đường trục hoành X (Baseline X-Axis) */}
          <line
            x1={paddingLeft}
            y1={baselineY}
            x2={viewBoxWidth - paddingRight}
            y2={baselineY}
            stroke="var(--glass-border)"
            strokeWidth="1.5"
          />

          {/* Đường chỉ báo Trung bình tháng (Average Benchmark Line) */}
          {stats && (
            <g>
              <line
                x1={paddingLeft}
                y1={avgY}
                x2={viewBoxWidth - paddingRight}
                y2={avgY}
                stroke="#F59E0B"
                strokeDasharray="4 3"
                strokeWidth="1.2"
                opacity="0.9"
              />
              <text
                x={viewBoxWidth - paddingRight}
                y={avgY - 4}
                textAnchor="end"
                fill="#F59E0B"
                fontSize="9"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                TB: {formatCompactVnd(stats.avg)}
              </text>
            </g>
          )}

          {/* DẠNG 1: BIỂU ĐỒ CỘT TÀI CHÍNH (BAR MODE) */}
          {chartMode === 'bar' && (
            <g>
              {items.map((item) => {
                const isActive = hoverIndex === item.index;
                const isMax = stats && item.value === stats.maxPoint.value && item.value > 0;
                return (
                  <g
                    key={item.label}
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

                    {/* Vệt sáng khi hover */}
                    {isActive && (
                      <rect
                        x={item.centerX - slotWidth / 2 + 2}
                        y={paddingTop}
                        width={slotWidth - 4}
                        height={graphHeight}
                        fill="rgba(59, 130, 246, 0.08)"
                      />
                    )}

                    {/* Cột dữ liệu chính */}
                    <rect
                      x={item.barX}
                      y={item.barY}
                      width={barWidth}
                      height={item.barH}
                      rx={2}
                      ry={2}
                      fill={isActive ? '#3B82F6' : color}
                      stroke={isActive ? '#60A5FA' : 'rgba(37, 99, 235, 0.9)'}
                      strokeWidth={1}
                      opacity={isActive ? 1 : 0.88}
                    />

                    {/* Tag hiển thị giá trị trên đỉnh cột cao nhất hoặc khi hover */}
                    {(isActive || (isMax && slotCount <= 8)) && (
                      <text
                        x={item.centerX}
                        y={Math.max(paddingTop + 10, item.barY - 5)}
                        textAnchor="middle"
                        fill="var(--text-primary)"
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="var(--font-mono)"
                      >
                        {formatCompactVnd(item.value)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* DẠNG 2: BIỂU ĐỒ ĐƯỜNG XU HƯỚNG (LINE MODE) */}
          {chartMode === 'line' && (
            <g>
              {/* Vùng màu mờ dưới đường */}
              <path
                d={`${linePath} L ${items[items.length - 1].centerX} ${baselineY} L ${items[0].centerX} ${baselineY} Z`}
                fill={color}
                opacity="0.12"
              />
              {/* Đường thẳng xu hướng sắc nét */}
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Các điểm dữ liệu tròn */}
              {items.map((item) => {
                const isActive = hoverIndex === item.index;
                return (
                  <g
                    key={item.label}
                    onMouseEnter={() => setHoverIndex(item.index)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={item.centerX}
                      cy={item.barY}
                      r={isActive ? 5 : 3.5}
                      fill="var(--bg-secondary)"
                      stroke={isActive ? '#60A5FA' : color}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Trục X: Vạch chia và nhãn thời gian */}
          {items.map((item) => {
            const isActive = hoverIndex === item.index;
            return (
              <g key={`axis-x-${item.label}`}>
                {/* Vạch chia nhỏ dưới trục hoành */}
                <line
                  x1={item.centerX}
                  y1={baselineY}
                  x2={item.centerX}
                  y2={baselineY + 4}
                  stroke="var(--glass-border)"
                  strokeWidth="1.2"
                />
                {/* Nhãn tháng căn giữa */}
                <text
                  x={item.centerX}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fill={isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  fontSize="10"
                  fontWeight={isActive ? '800' : '600'}
                  fontFamily="var(--font-mono)"
                >
                  T{item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip đối soát tài chính khi hover */}
        {activeItem && (
          <div
            className={styles.tooltipBox}
            style={{
              left: `${(activeItem.centerX / viewBoxWidth) * 100}%`,
              top: `${(activeItem.barY / viewBoxHeight) * 100}%`,
            }}
          >
            <span className={styles.tooltipTitle}>Tháng {activeItem.label}</span>
            <span className={styles.tooltipValue}>{formatValue(activeItem.value)}</span>
            {stats && (
              <span className={styles.tooltipSub}>
                {activeItem.value >= stats.avg ? '+' : ''}
                {(((activeItem.value - stats.avg) / Math.max(stats.avg, 1)) * 100).toFixed(1)}% so với trung bình
              </span>
            )}
            {activeItem.momChange !== null && (
              <span className={styles.tooltipSub} style={{ color: activeItem.momChange >= 0 ? '#10B981' : '#EF4444' }}>
                {activeItem.momChange >= 0 ? '▲ +' : '▼ '}
                {activeItem.momChange.toFixed(1)}% so với tháng trước
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
