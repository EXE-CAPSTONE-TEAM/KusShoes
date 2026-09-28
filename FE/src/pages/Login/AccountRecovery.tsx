import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Info, KeyRound, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { accountApi } from '../../api/account';
import { normalizeEmail, validateEmail, validatePassword, validateConfirmPassword } from '../../utils/authValidation';
import styles from './Login.module.css';

export type RecoveryMode = 'reset' | 'restore';

interface AccountRecoveryProps {
  mode: RecoveryMode;
  initialEmail?: string;
  onBack: () => void;
}

/** Two-step recovery: request a code by email, then confirm with the code (and a new password when resetting). */
export const AccountRecovery: React.FC<AccountRecoveryProps> = ({ mode, initialEmail = '', onBack }) => {
  const { t } = useTranslation('auth');
  const copy = mode === 'reset'
    ? {
        title: t('recovery.resetTitle'),
        intro: t('recovery.resetIntro'),
        done: t('recovery.resetDone'),
        button: t('recovery.resetButton'),
      }
    : {
        title: t('recovery.restoreTitle'),
        intro: t('recovery.restoreIntro'),
        done: t('recovery.restoreDone'),
        button: t('recovery.restoreButton'),
      };
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const normalized = normalizeEmail(email);
      const result =
        mode === 'reset'
          ? await accountApi.forgotPassword(normalized)
          : await accountApi.requestAccountRestore(normalized);
      setEmail(normalized);
      setNotice(result.message);
      setStep('code');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('recovery.sendCodeError'));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'reset') {
      const problem = validatePassword(newPassword) ?? validateConfirmPassword(newPassword, confirmPassword);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setError('');
    setLoading(true);
    try {
      if (mode === 'reset') {
        await accountApi.resetPassword(email, code, newPassword, confirmPassword);
      } else {
        await accountApi.confirmAccountRestore(email, code);
      }
      setNotice('');
      setStep('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('recovery.confirmCodeError'));
    } finally {
      setLoading(false);
    }
  };

  const Icon = mode === 'reset' ? KeyRound : RotateCcw;

  return (
    <div className={styles.otpSection}>
      <Icon size={42} className={styles.otpIcon} />
      <h3>{copy.title}</h3>

      {step === 'done' ? (
        <>
          <div className={styles.noticeMessage} role="status">
            <CheckCircle2 size={16} />
            <span>{copy.done}</span>
          </div>
          <button type="button" className="btn-neon-orange" style={{ width: '100%', justifyContent: 'center' }} onClick={onBack}>
            {t('backToSignIn')}
          </button>
        </>
      ) : (
        <>
          <p>{step === 'email' ? copy.intro : t('login.enterCodeSentTo', { email })}</p>
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

          {step === 'email' ? (
            <form onSubmit={requestCode} className={styles.form} noValidate>
              <div className={styles.inputGroup}>
                <label htmlFor="recovery-email">{t('emailLabel')}</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-neon-orange" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                <span>{loading ? t('sending') : t('recovery.sendCode')}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={confirm} className={styles.form} noValidate>
              <div className={styles.inputGroup}>
                <label htmlFor="recovery-code">{t('verificationCodeLabel')}</label>
                <input
                  id="recovery-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t('otpPlaceholder')}
                  className={`${styles.input} ${styles.otpInput}`}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {mode === 'reset' && (
                <>
                  <div className={styles.inputGroup}>
                    <label htmlFor="recovery-new-password">{t('recovery.newPasswordLabel')}</label>
                    <input
                      id="recovery-new-password"
                      type="password"
                      autoComplete="new-password"
                      className={styles.input}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label htmlFor="recovery-confirm-password">{t('recovery.confirmNewPasswordLabel')}</label>
                    <input
                      id="recovery-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      className={styles.input}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>
                </>
              )}
              <button
                type="submit"
                className="btn-neon-orange"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading || code.length !== 6}
              >
                <span>{loading ? t('recovery.working') : copy.button}</span>
              </button>
            </form>
          )}

          <div className={styles.otpActions}>
            <button type="button" className={styles.textButton} onClick={onBack} disabled={loading}>
              {t('backToSignIn')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
