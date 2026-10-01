import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle2, UserPlus, LogIn, Eye, EyeOff, UserRound, KeyRound, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { getStoredAttribution, pushAnalyticsEvent } from '../../analytics';
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
import { ConsentCheckbox } from '../../components/LegalConsentGate/ConsentCheckbox';
import { LoginArt } from './LoginArt';
import { AccountRecovery, type RecoveryMode } from './AccountRecovery';
import styles from './Login.module.css';

interface LoginProps {
  setPage: (page: string) => void;
}

export const Login: React.FC<LoginProps> = ({ setPage }) => {
  const { t } = useTranslation('auth');
  const { theme } = useTheme();
  // /login?register=1 opens the register tab (e.g. a new Google account that still has to consent).
  const [isLoginTab, setIsLoginTab] = useState(
    () => new URLSearchParams(window.location.search).get('register') !== '1',
  );
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
  const [notice, setNotice] = useState(() =>
    new URLSearchParams(window.location.search).get('google_consent') === '1'
      ? t('login.googleConsentNeeded')
      : '',
  );
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors & LoginFieldErrors>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'desktop' || params.get('return_to') === 'desktop') {
      try {
        sessionStorage.setItem('kusshoes_return_to_desktop', '1');
        localStorage.setItem('kusshoes_return_to_desktop', '1');
      } catch {
        // Ignore storage access restrictions
      }
    }
  }, []);

  // Password strength state
  const [strengthScore, setStrengthScore] = useState(0); // 0 to 3
  const [strengthLabelKey, setStrengthLabelKey] = useState<'tooWeak' | 'weak' | 'medium' | 'strong'>('tooWeak');

  useEffect(() => {
    if (!password) {
      setStrengthScore(0);
      setStrengthLabelKey('tooWeak');
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
        setStrengthLabelKey('weak');
        break;
      case 2:
        setStrengthLabelKey('medium');
        break;
      case 3:
        setStrengthLabelKey('strong');
        break;
      default:
        setStrengthLabelKey('tooWeak');
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

  // `isNewAccount`: the emailed code just verified a fresh registration (mirrors GoogleCallback).
  const finishAuthentication = (isNewAccount = false) => {
    if (isNewAccount) {
      const attribution = getStoredAttribution();
      pushAnalyticsEvent('sign_up', {
        method: 'password',
        utm_source: attribution?.utm_source,
        utm_campaign: attribution?.utm_campaign,
      });
    }
    pushAnalyticsEvent('login', { method: 'password' });
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
        setError(t('login.agreeTermsRequired'));
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
              ? t('login.mfaSentEmail')
              : t('login.mfaSentTotp'),
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
        setNotice(result.message || t('login.enterCodeSentTo', { email: result.email }));
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'AUTH_EMAIL_NOT_VERIFIED') {
          const userId = caught.data.user_id;
          if (typeof userId === 'string') {
            setPendingUserId(userId);
            setNotice(t('login.accountNotVerified'));
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
      setError(caught instanceof Error ? caught.message : t('login.authFailed'));
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
      // The code verifies the email of an account that was never signed into: a completed sign-up.
      finishAuthentication(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('login.otpVerifyFailed'));
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
        setError(t('login.mfaSessionExpired'));
      } else {
        setError(caught instanceof Error ? caught.message : t('login.mfaVerifyFailed'));
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
      setNotice(t('login.resendRemaining', { message: result.message, count: result.resendRemaining }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('login.resendFailed'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={styles.container}>
      <LoginArt />

      {/* Back to landing */}
      <button className={styles.backBtn} onClick={() => setPage('landing')}>
        <ArrowLeft size={16} />
        <span>{t('backToHome')}</span>
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
            <h3>{t('login.accessGranted')}</h3>
            <p>{t('login.redirecting')}</p>
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
            <h3>{t('login.twoStepVerification')}</h3>
            <p>
              {useRecoveryCode
                ? t('login.enterRecoveryCode')
                : mfaChallenge.method === 'email'
                  ? t('login.enterEmailCode')
                  : t('login.enterAuthenticatorCode')}
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
                <label htmlFor="mfa-code">{useRecoveryCode ? t('login.recoveryCodeLabel') : t('verificationCodeLabel')}</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode={useRecoveryCode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  maxLength={useRecoveryCode ? 32 : 6}
                  placeholder={useRecoveryCode ? t('login.recoveryCodePlaceholder') : t('otpPlaceholder')}
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
                <span>{loading ? t('verifying') : t('verifyAndContinue')}</span>
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
                {useRecoveryCode ? t('login.useVerificationCode') : t('login.useRecoveryCode')}
              </button>
              <button type="button" className={styles.textButton} onClick={leaveMfa} disabled={loading}>
                {t('backToSignIn')}
              </button>
            </div>
          </div>
        ) : pendingUserId ? (
          <div className={styles.otpSection}>
            <KeyRound size={42} className={styles.otpIcon} />
            <h3>{t('login.verifyYourEmail')}</h3>
            <p>{t('login.enterCodeSentTo', { email: email || t('login.yourEmail') })}</p>

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
                <label htmlFor="otp-code">{t('verificationCodeLabel')}</label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder={t('otpPlaceholder')}
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
                <span>{loading ? t('verifying') : t('verifyAndContinue')}</span>
              </button>
            </form>

            <div className={styles.otpActions}>
              <button type="button" className={styles.textButton} onClick={handleResendOtp} disabled={resending || loading}>
                {resending ? t('sending') : t('login.resendCode')}
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
                {t('backToSignIn')}
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
                {t('login.signInTab')}
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
                {t('login.registerTab')}
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              {!isLoginTab && (
                <>
                  <div className={styles.inputGroup}>
                    <label>{t('login.fullNameLabel')}</label>
                    <div className={styles.inputWrapper}>
                      <UserRound size={18} className={styles.inputIcon} />
                      <input
                        type="text"
                        placeholder={t('login.fullNamePlaceholder')}
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
                    <label>{t('login.usernameLabel')}</label>
                    <div className={styles.inputWrapper}>
                      <UserRound size={18} className={styles.inputIcon} />
                      <input
                        type="text"
                        placeholder={t('login.usernamePlaceholder')}
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, username: undefined }));
                        }}
                        className={`${styles.input} ${fieldErrors.username ? styles.inputInvalid : ''}`}
                        minLength={3}
                        maxLength={30}
                        pattern="[a-zA-Z0-9_]{3,30}"
                        title={t('login.usernamePatternTitle')}
                        autoComplete="username"
                        required
                      />
                    </div>
                    {renderFieldError(fieldErrors.username)}
                  </div>
                </>
              )}

              <div className={styles.inputGroup}>
                <label>{t('login.emailAddressLabel')}</label>
                <div className={styles.inputWrapper}>
                  <Mail size={18} className={styles.inputIcon} />
                  <input
                    type="email"
                    placeholder={t('emailPlaceholder')}
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
                <label>{t('login.passwordLabel')}</label>
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
                        {t('login.strengthCriteria')}
                      </span>
                      <span className={`${styles.strengthText} ${
                        strengthScore === 1 ? styles.weakText :
                        strengthScore === 2 ? styles.mediumText :
                        strengthScore === 3 ? styles.strongText : ''
                      }`}>
                        {t(`strength.${strengthLabelKey}`)}
                      </span>
                    </div>
                  </div>
                )}
                {renderFieldError(fieldErrors.password)}
              </div>

              {/* Confirm Password field (Register tab only) */}
              {!isLoginTab && (
                <div className={styles.inputGroup}>
                  <label>{t('login.confirmPasswordLabel')}</label>
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
                    <span>{t('login.rememberMe')}</span>
                  </label>
                  <a href="#forgot" onClick={(e) => { e.preventDefault(); setRecoveryMode('reset'); }} className={styles.forgotLink}>
                    {t('login.forgotPassword')}
                  </a>
                </div>
                <div className={styles.forgotRow} style={{ marginTop: '4px', justifyContent: 'flex-end' }}>
                  <a href="#restore" onClick={(e) => { e.preventDefault(); setRecoveryMode('restore'); }} className={styles.forgotLink}>
                    {t('login.restoreDeletedAccount')}
                  </a>
                </div>
                </>
              ) : (
                <div className={styles.forgotRow} style={{ marginTop: '4px' }}>
                  <ConsentCheckbox
                    className={styles.rememberMe}
                    checked={agreeTerms}
                    onChange={setAgreeTerms}
                  />
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
                <span>{loading ? t('login.authenticating') : isLoginTab ? t('login.signInTab') : t('login.createAccount')}</span>
              </button>
            </form>

            {/* Google Login Button */}
            <button
              className={styles.googleBtn} style={{ marginTop: '16px' }}
              type="button"
              onClick={() => {
                // Creating an account with Google needs the same 18+ / Terms / Privacy tick;
                // signing in to an existing account does not.
                if (!isLoginTab && !agreeTerms) {
                  setError(t('login.agreeTermsRequired'));
                  return;
                }
                api.startGoogleLogin({ consent: !isLoginTab && agreeTerms });
              }}
            >
              <svg className={styles.googleIcon} viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>{t('login.signInWithGoogle')}</span>
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};
