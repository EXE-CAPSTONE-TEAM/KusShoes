import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Info, KeyRound, RotateCcw } from 'lucide-react';
import { accountApi } from '../../api/account';
import { normalizeEmail, validateEmail, validatePassword, validateConfirmPassword } from '../../utils/authValidation';
import styles from './Login.module.css';

export type RecoveryMode = 'reset' | 'restore';

interface AccountRecoveryProps {
  mode: RecoveryMode;
  initialEmail?: string;
  onBack: () => void;
}

const COPY: Record<RecoveryMode, { title: string; intro: string; done: string; button: string }> = {
  reset: {
    title: 'Reset your password',
    intro: 'Enter your account email and we will send you a 6-digit recovery code.',
    done: 'Password updated. Please sign in with your new password.',
    button: 'Reset password',
  },
  restore: {
    title: 'Restore your account',
    intro: 'Deleted your account by mistake? Within 30 days you can bring it back. Enter your email to get a code.',
    done: 'Your account has been restored. Please sign in.',
    button: 'Restore account',
  },
};

/** Two-step recovery: request a code by email, then confirm with the code (and a new password when resetting). */
export const AccountRecovery: React.FC<AccountRecoveryProps> = ({ mode, initialEmail = '', onBack }) => {
  const copy = COPY[mode];
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
      setError(caught instanceof Error ? caught.message : 'Unable to send the code.');
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
      setError(caught instanceof Error ? caught.message : 'That code did not work.');
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
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <p>{step === 'email' ? copy.intro : `Enter the 6-digit code sent to ${email}.`}</p>
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
                <label htmlFor="recovery-email">Email</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-neon-orange" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                <span>{loading ? 'Sending...' : 'Send code'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={confirm} className={styles.form} noValidate>
              <div className={styles.inputGroup}>
                <label htmlFor="recovery-code">Verification code</label>
                <input
                  id="recovery-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className={`${styles.input} ${styles.otpInput}`}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {mode === 'reset' && (
                <>
                  <div className={styles.inputGroup}>
                    <label htmlFor="recovery-new-password">New password</label>
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
                    <label htmlFor="recovery-confirm-password">Confirm new password</label>
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
                <span>{loading ? 'Working...' : copy.button}</span>
              </button>
            </form>
          )}

          <div className={styles.otpActions}>
            <button type="button" className={styles.textButton} onClick={onBack} disabled={loading}>
              Back to sign in
            </button>
          </div>
        </>
      )}
    </div>
  );
};
