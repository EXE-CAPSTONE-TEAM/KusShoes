import { describe, expect, it } from 'vitest';
import { calculateNiceTicks } from './MrrAreaChart';

describe('calculateNiceTicks', () => {
  it('returns unique ascending ticks when all data is zero (rawMax clamps to 1)', () => {
    // step 0.5 rounds to [0, 1, 1]; duplicates become React `key` collisions on the axis <g>.
    const ticks = calculateNiceTicks(0, 1, 4);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks).toEqual([0, 1]);
  });

  it('keeps the usual nice steps for larger ranges', () => {
    expect(calculateNiceTicks(0, 8, 4)).toEqual([0, 2, 4, 6, 8]);
  });

  it('never returns duplicate ticks for small integer maxima', () => {
    for (let max = 1; max <= 12; max += 1) {
      const ticks = calculateNiceTicks(0, max, 4);
      expect(new Set(ticks).size, `max=${max}: ${ticks.join(',')}`).toBe(ticks.length);
    }
  });
});
