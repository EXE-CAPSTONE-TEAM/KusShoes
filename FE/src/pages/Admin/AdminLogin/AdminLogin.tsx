import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, LogIn } from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { useToast } from '../../../context/ToastContext';
import { AdminApiError } from '../../../api/adminClient';
import backgroundImage from '../../../assets/admin/admin-login-bg.jpg';
import styles from './AdminLogin.module.css';

export const AdminLogin: React.FC = () => {
  const { login } = useAdminAuth();
  const { theme } = useTheme();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.bgImage} style={{ backgroundImage: `url(${backgroundImage})` }} aria-hidden="true" />
      <div className={styles.bgOverlay} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <div className={`${styles.card} glass-panel`}>
        <div className={styles.scanLine} aria-hidden="true" />

        <div className={styles.brandRow}>
          <img
            src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
            alt="KusShoes"
            className={styles.brandLogo}
          />
          <span className={styles.brandTagline}>3D Sneaker Lab Portal</span>
        </div>

        <div className={styles.titleBlock}>
          <h1 className={styles.title}>KusShoes Admin Portal</h1>
          <p className={styles.subtitle}>Hệ thống quản trị số hóa &amp; phân tích mô hình 3D Sneaker.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="admin-email">Địa chỉ email công việc</label>
            <div className={styles.inputWrap}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@kusshoes.vn"
                autoComplete="username"
                required
              />
              <span className={styles.domainHint}>@kusshoes.vn</span>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="admin-password">Mật khẩu bảo mật</label>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => toast('Vui lòng liên hệ quản trị hệ thống để đặt lại mật khẩu.')}
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className={styles.inputWrap}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((v) => !v)}
                title="Ẩn / Hiện mật khẩu"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" className={`btn-neon-orange ${styles.submitBtn}`} disabled={loading}>
            <span>{loading ? 'Đang đăng nhập...' : 'Đăng nhập hệ thống'}</span>
            {loading ? <LogIn size={16} /> : <ArrowRight size={16} className={styles.submitArrow} />}
          </button>
        </form>

        <p className={styles.hint}>Chỉ dành cho tài khoản Admin &amp; Staff đã được cấp quyền trên hệ thống.</p>
      </div>
    </div>
  );
};
