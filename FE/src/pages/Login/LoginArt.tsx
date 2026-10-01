import React from 'react';
import leftLight from '../../assets/login-art/login-left-light.webp';
import leftDark from '../../assets/login-art/login-left-dark.webp';
import rightLight from '../../assets/login-art/login-right-light.webp';
import rightDark from '../../assets/login-art/login-right-dark.webp';
import styles from './LoginArt.module.css';

/**
 * Spray-can graffiti sneaker art flanking the auth card. Hidden on narrow screens (see
 * LoginArt.module.css) so it never competes with the form. Both theme variants render; CSS
 * picks one from `[data-theme]` on <html>, same convention as `components/EdgeArt`.
 */
export const LoginArt: React.FC = () => (
  <div className={styles.layer} aria-hidden="true">
    <div className={`${styles.edge} ${styles.left}`}>
      <img className={`${styles.img} ${styles.light}`} src={leftLight} alt="" loading="eager" decoding="async" draggable={false} />
      <img className={`${styles.img} ${styles.dark}`} src={leftDark} alt="" loading="eager" decoding="async" draggable={false} />
    </div>
    <div className={`${styles.edge} ${styles.right}`}>
      <img className={`${styles.img} ${styles.light}`} src={rightLight} alt="" loading="eager" decoding="async" draggable={false} />
      <img className={`${styles.img} ${styles.dark}`} src={rightDark} alt="" loading="eager" decoding="async" draggable={false} />
    </div>
  </div>
);
