import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopProgressBar } from './TopProgressBar';

const bar = () => screen.getByRole('progressbar', { hidden: true });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('TopProgressBar', () => {
  it('is hidden when idle', () => {
    render(<TopProgressBar active={false} />);
    expect(bar().getAttribute('aria-hidden')).toBe('true');
  });

  it('stays hidden if active ends before 150 ms', () => {
    const { rerender } = render(<TopProgressBar active />);
    advance(100);
    expect(bar().getAttribute('aria-hidden')).toBe('true');
    rerender(<TopProgressBar active={false} />);
    advance(1000);
    expect(bar().getAttribute('aria-hidden')).toBe('true');
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
  });

  it('appears after 150 ms and trickles without passing 90%', () => {
    render(<TopProgressBar active />);
    advance(160);
    expect(bar().getAttribute('aria-hidden')).toBe('false');
    let last = Number(bar().getAttribute('aria-valuenow'));
    expect(last).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      advance(200);
      const now = Number(bar().getAttribute('aria-valuenow'));
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBeLessThanOrEqual(90);
  });

  it('completes to 100% then hides when active turns false', () => {
    const { rerender } = render(<TopProgressBar active />);
    advance(500);
    rerender(<TopProgressBar active={false} />);
    expect(bar().getAttribute('aria-valuenow')).toBe('100');
    expect(bar().getAttribute('aria-hidden')).toBe('false');
    advance(400);
    expect(bar().getAttribute('aria-hidden')).toBe('true');
  });
});
