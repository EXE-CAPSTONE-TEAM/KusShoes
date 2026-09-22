import { describe, expect, it } from 'vitest';
import { describeUserAgent, formatDate, formatDateTime, formatVnd } from './format';

describe('format helpers', () => {
  it('formats money in VND', () => {
    expect(formatVnd(1234000)).toContain('VNĐ');
    expect(formatVnd(0)).toBe('0 VNĐ');
  });

  it('shows a dash for missing dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDate('2026-09-21T00:00:00Z')).not.toBe('—');
  });

  it('names the browser and OS from a user agent', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537')).toBe('Chrome on Windows');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/605')).toBe('Safari on iOS');
    expect(describeUserAgent('Mozilla/5.0 Edg/120 Chrome/120 (Windows)')).toBe('Edge on Windows');
    expect(describeUserAgent(null)).toBe('Unknown device');
    expect(describeUserAgent('curl/8.0')).toBe('curl/8.0');
  });
});
