import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, LogIn } from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { AdminApiError } from '../../../api/adminClient';
import styles from './AdminLogin.module.css';

export const AdminLogin: React.FC = () => {
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('admin@kusshoes.vn');
  const [password, setPassword] = useState('');
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
      <div className={`${styles.card} glass-panel`}>
        <div className={styles.iconWrap}>
          <ShieldCheck size={28} />
        </div>
        <h1 className={styles.title}>KusShoes Admin</h1>
        <p className={styles.subtitle}>Đăng nhập bằng tài khoản Admin hoặc Staff để quản trị hệ thống.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Email</label>
            <div className={styles.inputWrap}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@kusshoes.vn"
                required
              />
            </div>
          </div>
          <div className={styles.inputGroup}>
            <label>Mật khẩu</label>
            <div className={styles.inputWrap}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" className="btn-neon-orange" disabled={loading} style={{ justifyContent: 'center' }}>
            <LogIn size={18} />
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className={styles.hint}>
          Demo: <code>admin@kusshoes.vn</code> hoặc <code>staff@kusshoes.vn</code> · mật khẩu <code>Password123</code>
        </p>
      </div>
    </div>
  );
};
