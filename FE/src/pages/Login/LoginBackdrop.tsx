import React from 'react';
import styles from './LoginBackdrop.module.css';

/** Simple neon light streaks behind the auth card. Purely decorative. */
export const LoginBackdrop: React.FC = () => (
  <div className={styles.backdrop} aria-hidden="true">
    <span className={`${styles.streak} ${styles.s1}`} />
    <span className={`${styles.streak} ${styles.s2}`} />
    <span className={`${styles.streak} ${styles.s3}`} />
    <span className={`${styles.streak} ${styles.s4}`} />
  </div>
);
