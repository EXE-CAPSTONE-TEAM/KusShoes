import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle2, UserPlus, LogIn, Eye, EyeOff, CheckSquare, Square, UserRound, KeyRound, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
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
import { LoginBackdrop } from './LoginBackdrop';
import styles from './Login.module.css';

interface LoginProps {
  setPage: (page: string) => void;
}

export const Login: React.FC<LoginProps> = ({ setPage }) => {
  const { toast } = useToast();
  const { theme } = useTheme();
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  // 2FA: set when the password step succeeded but a second factor is still required (BR-12).
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; method: 'totp' | 'email' } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  // Password reset / deleted-account restore (both are emailed-code flows)
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode | null>(null);
  
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
        const outcome = await api.login(normalizeEmail(email), password, rememberMe);
        if (outcome.mfaRequired) {
          setMfaChallenge({ token: outcome.challengeToken, method: outcome.method });
          setNotice(
            outcome.method === 'email'
              ? 'We sent a verification code to your email.'
              : 'Enter the 6-digit code from your authenticator app.',
          );
          return;
        }
        finishAuthentication();
      } else {
        const result = await api.register({
          fullName: normalizeFullName(name),
          username: normalizeUsername(username),
          email: normalizeEmail(email),
          password,
          confirmPassword,
          ageConfirmed: agreeTerms,
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

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;

    setError('');
    setNotice('');
    setLoading(true);
    try {
      const credential = useRecoveryCode
        ? { recoveryCode: mfaCode.trim() }
        : { code: mfaCode.trim() };
      await api.verifyTwoFactorLogin(mfaChallenge.token, credential, rememberMe);
      finishAuthentication();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        // The challenge expired or was consumed: start over from the password step.
        setMfaChallenge(null);
        setMfaCode('');
        setError('Your verification session expired. Please sign in again.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Verification failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const leaveMfa = () => {
    setMfaChallenge(null);
    setMfaCode('');
    setUseRecoveryCode(false);
    setError('');
    setNotice('');
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

  return (
    <div className={styles.container}>
      <LoginBackdrop />

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
          <img
            src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
            alt="KusShoes"
            className={styles.logoImage}
          />
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
        ) : recoveryMode ? (
          <AccountRecovery
            mode={recoveryMode}
            initialEmail={email}
            onBack={() => {
              setRecoveryMode(null);
              setError('');
              setNotice('');
            }}
          />
        ) : mfaChallenge ? (
          <div className={styles.otpSection}>
            <ShieldCheck size={42} className={styles.otpIcon} />
            <h3>Two-step verification</h3>
            <p>
              {useRecoveryCode
                ? 'Enter one of your one-time recovery codes.'
                : mfaChallenge.method === 'email'
                  ? 'Enter the 6-digit code we emailed you.'
                  : 'Enter the 6-digit code from your authenticator app.'}
            </p>

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

            <form onSubmit={handleVerifyMfa} className={styles.form} noValidate>
              <div className={styles.inputGroup}>
                <label htmlFor="mfa-code">{useRecoveryCode ? 'Recovery code' : 'Verification code'}</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode={useRecoveryCode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  maxLength={useRecoveryCode ? 32 : 6}
                  placeholder={useRecoveryCode ? 'xxxx-xxxx' : '123456'}
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(useRecoveryCode ? event.target.value : event.target.value.replace(/\D/g, ''))
                  }
                  className={`${styles.input} ${styles.otpInput}`}
                  autoFocus
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-neon-orange"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading || (useRecoveryCode ? mfaCode.trim().length < 6 : mfaCode.length !== 6)}
              >
                <CheckCircle2 size={18} />
                <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
              </button>
            </form>

            <div className={styles.otpActions}>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setUseRecoveryCode(!useRecoveryCode);
                  setMfaCode('');
                  setError('');
                }}
                disabled={loading}
              >
                {useRecoveryCode ? 'Use verification code' : 'Use a recovery code'}
              </button>
              <button type="button" className={styles.textButton} onClick={leaveMfa} disabled={loading}>
                Back to sign in
              </button>
            </div>
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
                        placeholder="Your full name"
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
                        placeholder="your_username"
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
                    placeholder="you@example.com"
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
                <>
                <div className={styles.forgotRow}>
                  <label className={styles.rememberMe}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <a href="#forgot" onClick={(e) => { e.preventDefault(); setRecoveryMode('reset'); }} className={styles.forgotLink}>
                    Forgot password?
                  </a>
                </div>
                <div className={styles.forgotRow} style={{ marginTop: '4px', justifyContent: 'flex-end' }}>
                  <a href="#restore" onClick={(e) => { e.preventDefault(); setRecoveryMode('restore'); }} className={styles.forgotLink}>
                    Restore a deleted account
                  </a>
                </div>
                </>
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
                    <span>I confirm I'm 16 or older and agree to the Terms of Service & Privacy</span>
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

            {/* Google Login Button */}
            <button 
              className={styles.googleBtn} style={{ marginTop: '16px' }}
              type="button"
              disabled
              title="Google authentication is not connected yet"
            >
              <svg className={styles.googleIcon} viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};
