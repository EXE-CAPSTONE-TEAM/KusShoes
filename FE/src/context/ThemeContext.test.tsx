import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

let api: ReturnType<typeof useTheme>;
const Probe = () => {
  api = useTheme();
  return null;
};

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('data-theme');
  root.classList.remove('theme-switching');
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('theme switching', () => {
  it('cross-fades the whole page with the View Transitions API when it exists', () => {
    const start = vi.fn((update: () => void) => {
      update();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    render(<ThemeProvider><Probe /></ThemeProvider>);

    act(() => api.setTheme('light'));

    expect(start).toHaveBeenCalledTimes(1);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(api.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('falls back to a temporary transition class and removes it afterwards', () => {
    vi.useFakeTimers();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => api.setTheme('dark')); // initial state, may or may not animate
    act(() => vi.advanceTimersByTime(500));

    act(() => api.setTheme('light'));
    expect(root.classList.contains('theme-switching')).toBe(true);
    expect(root.getAttribute('data-theme')).toBe('light');

    act(() => vi.advanceTimersByTime(500));
    expect(root.classList.contains('theme-switching')).toBe(false);
  });

  it('switches instantly for users who prefer reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const start = vi.fn();
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    render(<ThemeProvider><Probe /></ThemeProvider>);

    act(() => api.toggleTheme());

    expect(start).not.toHaveBeenCalled();
    expect(root.classList.contains('theme-switching')).toBe(false);
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('toggles back and forth', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => api.toggleTheme());
    expect(api.theme).toBe('light');
    act(() => api.toggleTheme());
    expect(api.theme).toBe('dark');
  });
});
