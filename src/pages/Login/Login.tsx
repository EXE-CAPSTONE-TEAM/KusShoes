import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, Disc, CheckCircle2, UserPlus, LogIn, Eye, EyeOff, CheckSquare, Square, UserRound, KeyRound, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  normalizeEmail,
  normalizeFullName,
  normalizeUsername,
  validateLoginForm,
  validateRegisterForm,
  describeAuthApiError,
  type RegisterFieldErrors,
  type LoginFieldErrors,
} from '../../utils/authValidation';
import styles from './Login.module.css';

interface LoginProps {
  setPage: (page: string) => void;
}

export const Login: React.FC<LoginProps> = ({ setPage }) => {
  const { toast } = useToast();
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors & LoginFieldErrors>({});

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
    const hasDigit = /\d/.test(password);

    if (hasLength) score += 1;
    if (hasUpper) score += 1;
    if (hasDigit) score += 1;

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

  const renderFieldError = (message?: string) =>
    message ? (
      <span className={styles.fieldError}>
        <AlertCircle size={13} />
        <span>{message}</span>
      </span>
    ) : null;

  const finishAuthentication = () => {
    setSuccess(true);
    window.setTimeout(() => setPage('dashboard'), 900);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setFieldErrors({});

    if (isLoginTab) {
      const errors = validateLoginForm({ email, password });
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    } else {
      const errors = validateRegisterForm({
        email,
        username,
        password,
        confirmPassword,
        fullName: name,
      });
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      if (!agreeTerms) {
        setError('You must agree to the Terms of Service & Privacy Policy.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isLoginTab) {
        await api.login(normalizeEmail(email), password, rememberMe);
        finishAuthentication();
      } else {
        const result = await api.register({
          fullName: normalizeFullName(name),
          username: normalizeUsername(username),
          email: normalizeEmail(email),
          password,
          confirmPassword,
        });
        setPendingUserId(result.userId);
        setNotice(result.message || `A verification code was sent to ${result.email}.`);
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'AUTH_EMAIL_NOT_VERIFIED') {
          const userId = caught.data.user_id;
          if (typeof userId === 'string') {
            setPendingUserId(userId);
            setNotice('Your account is not verified. Enter the OTP sent to your email.');
            return;
          }
        }
        const { field, message } = describeAuthApiError(caught);
        if (field) {
          setFieldErrors({ [field]: message });
        } else {
          setError(message);
        }
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserId) return;

    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api.verifyOtp(pendingUserId, otpCode, rememberMe);
      finishAuthentication();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingUserId) return;

    setError('');
    setNotice('');
    setResending(true);
    try {
      const result = await api.resendOtp(pendingUserId);
      setNotice(`${result.message} (${result.resendRemaining} resend attempts remaining)`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to resend OTP.');
    } finally {
      setResending(false);
    }
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
            <p>Redirecting to KusShoes Portal...</p>
          </div>
        ) : pendingUserId ? (
          <div className={styles.otpSection}>
            <KeyRound size={42} className={styles.otpIcon} />
            <h3>Verify your email</h3>
            <p>Enter the 6-digit code sent to {email || 'your email'}.</p>

            {notice && (
              <div className={styles.noticeMessage} role="status">
                <Info size={16} />
                <span>{notice}</span>
              </div>
            )}
            {error && (
              <div className={styles.errorMessage} role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className={styles.form} noValidate>
              <div className={styles.inputGroup}>
                <label htmlFor="otp-code">Verification code</label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                  className={`${styles.input} ${styles.otpInput}`}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-neon-orange"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading || otpCode.length !== 6}
              >
                <CheckCircle2 size={18} />
                <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
              </button>
            </form>

            <div className={styles.otpActions}>
              <button type="button" className={styles.textButton} onClick={handleResendOtp} disabled={resending || loading}>
                {resending ? 'Sending...' : 'Resend code'}
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setPendingUserId(null);
                  setOtpCode('');
                  setError('');
                  setNotice('');
                  setIsLoginTab(true);
                }}
                disabled={loading || resending}
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Google Login Button */}
            <button 
              className={`${styles.googleBtn} glass-panel`} 
              type="button"
              disabled
              title="Google authentication is not connected yet"
            >
              <svg className={styles.googleIcon} viewBox="0 0 24 24" width="18" height="18">
                <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.79 5.79 0 0 1 8.2 12.725a5.79 5.79 0 0 1 5.79-5.79c2.316 0 4.195 1.157 5.093 2.871l3.298-3.298C20.378 4.412 17.417 2.5 13.99 2.5 8.197 2.5 3.5 7.197 3.5 12.99s4.697 10.49 10.49 10.49c6.069 0 10.372-4.26 10.372-10.537 0-.74-.093-1.296-.231-1.658H12.24z"/>
              </svg>
              <span>Continue with Google (coming soon)</span>
            </button>

            <div className={styles.divider} style={{ margin: '16px 0 24px' }}>
              <span />
              <span style={{ fontSize: '0.65rem' }}>OR CONNECT WITH EMAIL</span>
              <span />
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
              <button 
                type="button"
                className={`${styles.tabBtn} ${isLoginTab ? styles.activeTab : ''}`}
                onClick={() => {
                  setIsLoginTab(true);
                  setError('');
                  setNotice('');
                  setFieldErrors({});
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${!isLoginTab ? styles.activeTab : ''}`}
                onClick={() => {
                  setIsLoginTab(false);
                  setError('');
                  setNotice('');
                  setFieldErrors({});
                }}
              >
                Register
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              {!isLoginTab && (
                <>
                  <div className={styles.inputGroup}>
                    <label>Full Name</label>
                    <div className={styles.inputWrapper}>
                      <UserRound size={18} className={styles.inputIcon} />
                      <input
                        type="text"
                        placeholder="Duy Nguyen"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                        }}
                        className={`${styles.input} ${fieldErrors.fullName ? styles.inputInvalid : ''}`}
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        required
                      />
                    </div>
                    {renderFieldError(fieldErrors.fullName)}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Username</label>
                    <div className={styles.inputWrapper}>
                      <UserRound size={18} className={styles.inputIcon} />
                      <input
                        type="text"
                        placeholder="duy_nguyen"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, username: undefined }));
                        }}
                        className={`${styles.input} ${fieldErrors.username ? styles.inputInvalid : ''}`}
                        minLength={3}
                        maxLength={30}
                        pattern="[a-zA-Z0-9_]{3,30}"
                        title="Use 3-30 letters, numbers, or underscores"
                        autoComplete="username"
                        required
                      />
                    </div>
                    {renderFieldError(fieldErrors.username)}
                  </div>
                </>
              )}

              <div className={styles.inputGroup}>
                <label>Email Address</label>
                <div className={styles.inputWrapper}>
                  <Mail size={18} className={styles.inputIcon} />
                  <input
                    type="email"
                    placeholder="duy.nguyen@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    className={`${styles.input} ${fieldErrors.email ? styles.inputInvalid : ''}`}
                    autoComplete="email"
                    required
                  />
                </div>
                {renderFieldError(fieldErrors.email)}
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
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    className={`${styles.input} ${fieldErrors.password ? styles.inputInvalid : ''}`}
                    autoComplete={isLoginTab ? 'current-password' : 'new-password'}
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
                        Min 8 chars, 1 uppercase, 1 number
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
                {renderFieldError(fieldErrors.password)}
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
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }}
                      className={`${styles.input} ${fieldErrors.confirmPassword ? styles.inputInvalid : ''}`}
                      autoComplete="new-password"
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
                  {renderFieldError(fieldErrors.confirmPassword)}
                </div>
              )}

              {isLoginTab ? (
                <div className={styles.forgotRow}>
                  <label className={styles.rememberMe}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <a href="#forgot" onClick={(e) => { e.preventDefault(); toast('Reset password link sent.'); }} className={styles.forgotLink}>
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

              {notice && (
                <div className={styles.noticeMessage} role="status">
                  <Info size={16} />
                  <span>{notice}</span>
                </div>
              )}
              {error && (
                <div className={styles.errorMessage} role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit btn */}
              <button 
                type="submit" 
                className="btn-neon-orange" 
                style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} 
                disabled={loading}
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
              disabled={loading}
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
