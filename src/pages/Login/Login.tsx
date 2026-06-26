import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, Disc, CheckCircle2, UserPlus, LogIn, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './Login.module.css';

interface LoginProps {
  setPage: (page: string) => void;
}

export const Login: React.FC<LoginProps> = ({ setPage }) => {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [success, setSuccess] = useState(false);

  // Password strength state
  const [strengthScore, setStrengthScore] = useState(0); // 0 to 3
  const [strengthLabel, setStrengthLabel] = useState('Too Weak');

  useEffect(() => {
    if (!password) {
      setStrengthScore(0);
      setStrengthLabel('Too Weak');
      return;
    }

    let score = 0;
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (hasLength) score += 1;
    if (hasUpper) score += 1;
    if (hasSpecial) score += 1;

    setStrengthScore(score);

    switch (score) {
      case 1:
        setStrengthLabel('Weak');
        break;
      case 2:
        setStrengthLabel('Medium');
        break;
      case 3:
        setStrengthLabel('Strong');
        break;
      default:
        setStrengthLabel('Too Weak');
        break;
    }
  }, [password]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginTab) {
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (strengthScore < 3) {
        alert('Please choose a stronger password (must be > 8 characters, with 1 uppercase and 1 special symbol).');
        return;
      }
      if (!agreeTerms) {
        alert('You must agree to the Terms of Service & Privacy Policy.');
        return;
      }
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        setPage('dashboard');
      }, 1000);
    }, 1500);
  };

  const handleGoogleLogin = () => {
    setLoadingGoogle(true);
    setTimeout(() => {
      setLoadingGoogle(false);
      setSuccess(true);
      setTimeout(() => {
        setPage('dashboard');
      }, 1000);
    }, 1500);
  };

  const handleBypass = () => {
    setPage('dashboard');
  };

  return (
    <div className={styles.container}>
      {/* Back to landing */}
      <button className={styles.backBtn} onClick={() => setPage('landing')}>
        <ArrowLeft size={16} />
        <span>Back to Home</span>
      </button>

      {/* Auth Panel */}
      <motion.div 
        className={`${styles.authCard} glass-panel`}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Brand */}
        <div className={styles.brandHeader}>
          <div className={styles.logoContainer}>
            <Disc className={styles.logoIcon} />
          </div>
          <h2 className={styles.brandTitle}>SNEAKER FLOW</h2>
          <p className={styles.brandSubtitle}>DIGITIZE & DESIGN SYSTEM</p>
        </div>

        {/* Success animation */}
        {success ? (
          <div className={styles.successScreen}>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <CheckCircle2 size={48} className={styles.successIcon} />
            </motion.div>
            <h3>Access Granted</h3>
            <p>Redirecting to Sneaker Flow Portal...</p>
          </div>
        ) : (
          <>
            {/* Google Login Button */}
            <button 
              className={`${styles.googleBtn} glass-panel`} 
              onClick={handleGoogleLogin}
              disabled={loading || loadingGoogle}
            >
              <svg className={styles.googleIcon} viewBox="0 0 24 24" width="18" height="18">
                <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.79 5.79 0 0 1 8.2 12.725a5.79 5.79 0 0 1 5.79-5.79c2.316 0 4.195 1.157 5.093 2.871l3.298-3.298C20.378 4.412 17.417 2.5 13.99 2.5 8.197 2.5 3.5 7.197 3.5 12.99s4.697 10.49 10.49 10.49c6.069 0 10.372-4.26 10.372-10.537 0-.74-.093-1.296-.231-1.658H12.24z"/>
              </svg>
              <span>{loadingGoogle ? 'Connecting Google...' : 'Continue with Google'}</span>
            </button>

            <div className={styles.divider} style={{ margin: '16px 0 24px' }}>
              <span />
              <span style={{ fontSize: '0.65rem' }}>OR CONNECT WITH EMAIL</span>
              <span />
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
              <button 
                className={`${styles.tabBtn} ${isLoginTab ? styles.activeTab : ''}`}
                onClick={() => setIsLoginTab(true)}
              >
                Sign In
              </button>
              <button 
                className={`${styles.tabBtn} ${!isLoginTab ? styles.activeTab : ''}`}
                onClick={() => setIsLoginTab(false)}
              >
                Register
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.form}>
              {!isLoginTab && (
                <div className={styles.inputGroup}>
                  <label>Full Name</label>
                  <div className={styles.inputWrapper}>
                    <input
                      type="text"
                      placeholder="Duy Nguyen"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={styles.input}
                      style={{ paddingLeft: '16px' }}
                      required
                    />
                  </div>
                </div>
              )}

              <div className={styles.inputGroup}>
                <label>Email Address</label>
                <div className={styles.inputWrapper}>
                  <Mail size={18} className={styles.inputIcon} />
                  <input
                    type="email"
                    placeholder="duy.nguyen@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.input}
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div className={styles.inputGroup}>
                <label>Password</label>
                <div className={styles.inputWrapper}>
                  <Lock size={18} className={styles.inputIcon} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                    required
                  />
                  <button 
                    type="button" 
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {!isLoginTab && password && (
                  <div className={styles.strengthContainer}>
                    <div className={styles.strengthBarBg}>
                      <div 
                        className={`${styles.strengthBarFill} ${
                          strengthScore === 1 ? styles.weak : 
                          strengthScore === 2 ? styles.medium : 
                          strengthScore === 3 ? styles.strong : ''
                        }`}
                        style={{ width: `${(strengthScore / 3) * 100}%` }}
                      />
                    </div>
                    <div className={styles.strengthLabels}>
                      <span className={styles.strengthCriteria}>
                        Min 8 chars, 1 uppercase, 1 symbol
                      </span>
                      <span className={`${styles.strengthText} ${
                        strengthScore === 1 ? styles.weakText : 
                        strengthScore === 2 ? styles.mediumText : 
                        strengthScore === 3 ? styles.strongText : ''
                      }`}>
                        {strengthLabel}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password field (Register tab only) */}
              {!isLoginTab && (
                <div className={styles.inputGroup}>
                  <label>Confirm Password</label>
                  <div className={styles.inputWrapper}>
                    <Lock size={18} className={styles.inputIcon} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={styles.input}
                      required
                    />
                    <button 
                      type="button" 
                      className={styles.eyeBtn}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {isLoginTab ? (
                <div className={styles.forgotRow}>
                  <label className={styles.rememberMe}>
                    <input type="checkbox" defaultChecked />
                    <span>Remember me</span>
                  </label>
                  <a href="#forgot" onClick={(e) => { e.preventDefault(); alert('Reset password link sent.'); }} className={styles.forgotLink}>
                    Forgot password?
                  </a>
                </div>
              ) : (
                <div className={styles.forgotRow} style={{ marginTop: '4px' }}>
                  <label 
                    className={styles.rememberMe}
                    onClick={() => setAgreeTerms(!agreeTerms)}
                  >
                    {agreeTerms ? (
                      <CheckSquare size={16} className={styles.checkboxIconActive} />
                    ) : (
                      <Square size={16} className={styles.checkboxIcon} />
                    )}
                    <span>I agree to the Terms of Service & Privacy</span>
                  </label>
                </div>
              )}

              {/* Submit btn */}
              <button 
                type="submit" 
                className="btn-neon-orange" 
                style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} 
                disabled={loading || loadingGoogle}
              >
                {isLoginTab ? <LogIn size={18} /> : <UserPlus size={18} />}
                <span>{loading ? 'Authenticating...' : isLoginTab ? 'Sign In' : 'Create Account'}</span>
              </button>
            </form>

            <div className={styles.divider}>
              <span />
              <span>OR</span>
              <span />
            </div>

            {/* Bypass/Guest Login */}
            <button 
              className={`${styles.bypassBtn} btn-outline`} 
              onClick={handleBypass} 
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading || loadingGoogle}
            >
              <span>Quick Login as Guest</span>
            </button>

            <p className={styles.bypassTip}>Bypass login flow for rapid portal testing.</p>
          </>
        )}
      </motion.div>
    </div>
  );
};
