import React from 'react';
import styles from './LoadingDots.module.css';

export interface LoadingDotsProps {
  /** Optional message displayed next to or below the bouncing dots */
  label?: string;
  /** Size of the dots: sm (4px), md (6px, default), lg (8px) */
  size?: 'sm' | 'md' | 'lg';
  /** Color theme: 'accent' (default orange #FF6B35), 'muted' (gray), 'primary' */
  color?: 'accent' | 'muted' | 'primary';
  /** Centers the loader inside its parent with balanced vertical padding */
  center?: boolean;
  /** Renders as an inline-flex element (great for table rows or text) */
  inline?: boolean;
  /** ARIA role override (pass null to omit role="status" when parent already has it) */
  role?: string | null;
  /** Extra custom CSS class */
  className?: string;
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  label,
  size = 'md',
  color = 'accent',
  center = false,
  inline = false,
  role = 'status',
  className = '',
}) => {
  return (
    <div
      {...(role ? { role, 'aria-label': label || 'Loading…' } : {})}
      className={`${styles.container} ${styles[size]} ${styles[color]} ${
        center ? styles.center : ''
      } ${inline ? styles.inline : ''} ${className}`}
    >
      <span className={styles.dots} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
      {label && (
        <span className={`${styles.label} ${size === 'sm' ? styles.labelSm : ''}`}>
          {label}
        </span>
      )}
    </div>
  );
};
