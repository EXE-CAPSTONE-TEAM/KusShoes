import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const SWITCH_CLASS = 'theme-switching';
const SWITCH_MS = 380;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Change the theme so the whole page cross-fades together.
 *
 * Each component only transitions some of its properties (gradients, shadows, text colour, the logo
 * image swap...), so flipping `data-theme` on its own makes parts of the page change at different
 * moments. The View Transitions API snapshots the page and fades between the two states; where it is
 * unavailable, a short-lived class makes every element transition the same properties instead.
 */
function paintTheme(theme: Theme, commit: () => void, timers: { current: number | null }): void {
  const root = document.documentElement;
  const apply = () => {
    commit();
    root.setAttribute('data-theme', theme);
  };

  if (root.getAttribute('data-theme') === theme || prefersReducedMotion()) {
    apply();
    return;
  }

  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => flushSync(apply));
    return;
  }

  if (timers.current !== null) window.clearTimeout(timers.current);
  root.classList.add(SWITCH_CLASS);
  apply();
  timers.current = window.setTimeout(() => {
    root.classList.remove(SWITCH_CLASS);
    timers.current = null;
  }, SWITCH_MS);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // default to dark theme
  });

  const fallbackTimer = useRef<number | null>(null);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    paintTheme(newTheme, () => setThemeState(newTheme), fallbackTimer);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
