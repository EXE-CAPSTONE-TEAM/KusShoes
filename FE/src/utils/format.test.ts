import { describe, expect, it } from 'vitest';
import {
  describeUserAgent,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatVnd,
} from './format';

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
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537')).toBe(
      'Chrome on Windows',
    );
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/605')).toBe(
      'Safari on iOS',
    );
    expect(describeUserAgent('Mozilla/5.0 Edg/120 Chrome/120 (Windows)')).toBe('Edge on Windows');
    expect(describeUserAgent(null)).toBe('Unknown device');
    expect(describeUserAgent('curl/8.0')).toBe('curl/8.0');
  });

  describe('formatRelativeTime', () => {
    const now = new Date('2026-06-15T12:00:00');

    it('shows "just now" for under a minute', () => {
      expect(formatRelativeTime(new Date('2026-06-15T11:59:31'), now)).toBe('just now');
    });

    it('shows minutes and hours ago', () => {
      expect(formatRelativeTime(new Date('2026-06-15T11:55:00'), now)).toBe('5m ago');
      expect(formatRelativeTime(new Date('2026-06-15T10:00:00'), now)).toBe('2h ago');
    });

    it('shows "yesterday" by calendar day, not raw 24h', () => {
      // Only 13h ago, but the previous calendar day — still "yesterday".
      expect(formatRelativeTime(new Date('2026-06-14T23:00:00'), now)).toBe('yesterday');
    });

    it('shows a day count under a week', () => {
      expect(formatRelativeTime(new Date('2026-06-12T12:00:00'), now)).toBe('3d ago');
    });

    it('falls back to an absolute date past a week, with year only if it differs', () => {
      expect(formatRelativeTime(new Date('2026-05-14T12:00:00'), now)).toBe('May 14');
      expect(formatRelativeTime(new Date('2025-05-14T12:00:00'), now)).toBe('May 14, 2025');
    });

    it('shows a dash for missing/invalid input', () => {
      expect(formatRelativeTime(null, now)).toBe('—');
      expect(formatRelativeTime('not-a-date', now)).toBe('—');
    });
  });
});
