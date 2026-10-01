import React, { useEffect, useState } from 'react';
import styles from './TypingText.module.css';

interface TypingTextProps {
  text: string;
  /** Types while true; resets to empty when false so it replays the next time it turns true. */
  active: boolean;
  /** Milliseconds per character. */
  speed?: number;
  /** Milliseconds to wait after `active` turns true before the first character. */
  delay?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Types `text` out one character at a time with a blinking orange caret.
 * The full text is rendered invisibly underneath so the box never changes height while typing,
 * and screen readers always get the complete sentence.
 */
export const TypingText: React.FC<TypingTextProps> = ({
  text,
  active,
  speed = 28,
  delay = 0,
}) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) {
      setCount(0);
      setStarted(false);
      return;
    }
    if (prefersReducedMotion()) {
      setCount(text.length);
      setStarted(true);
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const startTimer = setTimeout(() => {
      setStarted(true);
      interval = setInterval(() => {
        setCount((c) => {
          if (c >= text.length && interval) clearInterval(interval);
          return Math.min(c + 1, text.length);
        });
      }, speed);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [active, text, speed, delay]);

  const typing = active && started && count < text.length;

  return (
    <span className={styles.root}>
      <span className={styles.srOnly}>{text}</span>
      <span className={styles.sizer} aria-hidden="true">
        {text}
      </span>
      <span className={styles.typed} aria-hidden="true">
        {text.slice(0, count)}
        {typing || (active && !started) ? <span className={styles.caret} /> : null}
      </span>
    </span>
  );
};
