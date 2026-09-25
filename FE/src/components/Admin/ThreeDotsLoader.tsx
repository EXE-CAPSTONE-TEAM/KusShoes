import React from 'react';
import styles from './ThreeDotsLoader.module.css';

interface ThreeDotsLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Hiệu ứng ba chấm lên xuống (3-dot bouncing loader)
 */
export const ThreeDotsLoader: React.FC<ThreeDotsLoaderProps> = ({
  size = 'md',
  color,
  className = '',
  style,
}) => {
  const sizeClass = size === 'sm' ? styles.sizeSm : size === 'lg' ? styles.sizeLg : styles.sizeMd;

  return (
    <span
      className={`${styles.loaderWrapper} ${sizeClass} ${className}`}
      style={{ color: color ?? 'currentColor', ...style }}
      aria-label="Đang tải dữ liệu"
      role="status"
    >
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
};

interface BlockLoaderProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  minHeight?: number | string;
  style?: React.CSSProperties;
}

/**
 * Khung loading ba chấm dạng block dùng cho ô biểu đồ / danh sách
 */
export const ThreeDotsBlockLoader: React.FC<BlockLoaderProps> = ({
  text = 'Đang tải số liệu...',
  size = 'lg',
  minHeight,
  style,
}) => {
  return (
    <div
      className={styles.blockContainer}
      style={{ minHeight: minHeight ?? 160, ...style }}
      role="status"
      aria-live="polite"
    >
      <ThreeDotsLoader size={size} color="var(--color-orange, #3B82F6)" />
      {text && <span className={styles.blockText}>{text}</span>}
    </div>
  );
};
