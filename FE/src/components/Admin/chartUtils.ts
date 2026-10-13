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
    const rounded = Math.round(v);
    // Sub-integer steps (e.g. all-zero data → max 1, step 0.5) round to repeated values;
    // ticks are used as React keys on the axis, so keep each value once.
    if (ticks[ticks.length - 1] !== rounded) ticks.push(rounded);
  }
  return ticks;
}

/** Kiểu chữ trục dùng chung cho mọi biểu đồ Recharts của trang admin. */
export const AXIS_TICK = { fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 } as const;
export const GRID_STROKE = 'var(--glass-border)';
/** DS §5.1: trục 1.5px, vạch chia (tick mark) 4px. */
export const AXIS_LINE = { stroke: GRID_STROKE, strokeWidth: 1.5 } as const;
export const TICK_LINE = { stroke: GRID_STROKE, strokeWidth: 1.2 } as const;
export const TICK_SIZE = 4;
/** Màu ngữ nghĩa tài chính (variables.css, có biến thể Light Mode). */
export const FIN_BLUE = 'var(--fin-blue)';
export const FIN_GREEN = 'var(--fin-green)';
export const FIN_RED = 'var(--fin-red)';
export const FIN_AMBER = 'var(--fin-amber)';
export const Y_AXIS_WIDTH = 56;
/** Kích thước khởi tạo cho ResponsiveContainer để render được trước khi đo layout (SSR/jsdom). */
export const INITIAL_CHART_WIDTH = 720;
