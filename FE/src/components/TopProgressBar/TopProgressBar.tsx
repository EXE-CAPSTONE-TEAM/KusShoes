import React, { useEffect, useRef, useState } from 'react';
import styles from './TopProgressBar.module.css';

const SHOW_DELAY = 150;
const TRICKLE_MS = 200;
const FADE_MS = 200;

type Phase = 'idle' | 'active' | 'fading';

interface TopProgressBarProps {
  /** true while a route transition is pending. */
  active: boolean;
}

/**
 * 2px route-progress line at the top of the viewport. Only appears if the transition stays
 * pending for 150 ms, trickles toward 90%, completes to 100% and fades out when it ends.
 */
export const TopProgressBar: React.FC<TopProgressBarProps> = ({ active }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  useEffect(() => {
    if (active) {
      const show = window.setTimeout(() => {
        setProgress((p) => Math.max(p, 0.1)); // monotonic
        setPhase('active');
      }, SHOW_DELAY);
      const trickle = window.setInterval(() => {
        if (phaseRef.current !== 'active') return;
        setProgress((p) => Math.max(p, p + (0.9 - p) * 0.1));
      }, TRICKLE_MS);
      return () => {
        window.clearTimeout(show);
        window.clearInterval(trickle);
      };
    }
    if (phaseRef.current !== 'active') return;
    setProgress(1);
    setPhase('fading');
    const reset = window.setTimeout(() => {
      setPhase('idle');
      setProgress(0);
    }, FADE_MS + 100);
    return () => window.clearTimeout(reset);
  }, [active]);

  const className = [
    styles.track,
    phase === 'active' ? styles.visible : '',
    phase === 'fading' ? styles.fading : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-hidden={phase === 'idle'}
    >
      <div className={styles.bar} style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
};
