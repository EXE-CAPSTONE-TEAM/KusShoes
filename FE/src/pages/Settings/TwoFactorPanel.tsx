import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Mail, Copy, Download, ShieldCheck, ShieldOff, AlertTriangle } from 'lucide-react';
import { accountApi, type TwoFactorMethod, type TwoFactorSetup, type TwoFactorStatus } from '../../api/account';
import { useToast } from '../../context/ToastContext';
import styles from './Settings.module.css';
import panel from './AccountPanels.module.css';

type View = 'idle' | 'choose' | 'confirm' | 'recoveryCodes' | 'disable';

export const TwoFactorPanel: React.FC = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [view, setView] = useState<View>('idle');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryEmailCode, setRecoveryEmailCode] = useState('');
  const [awaitingEmailCode, setAwaitingEmailCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await accountApi.twoFactorStatus());
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to load two-factor status.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Something went wrong.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = (method: TwoFactorMethod) =>
    run(async () => {
      setSetup(await accountApi.setupTwoFactor(method));
      setCode('');
      setView('confirm');
      if (method === 'email') toast('We sent a verification code to your email.', 'info');
    });

  const enable = (event: React.FormEvent) => {
    event.preventDefault();
    if (!setup) return;
    void run(async () => {
      const result = await accountApi.enableTwoFactor(setup.method, code.trim());
      setRecoveryCodes(result.recovery_codes);
      setView('recoveryCodes');
      setCode('');
      await refresh();
    });
  };

  const disable = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await accountApi.disableTwoFactor({
        password: password || undefined,
        code: code.trim() || undefined,
      });
      toast('Two-factor authentication turned off.');
      setPassword('');
      setCode('');
      setView('idle');
      await refresh();
    });
  };

  const saveRecoveryEmail = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await accountApi.setRecoveryEmail(recoveryEmail.trim());
      toast(result.message || 'Verification code sent.', 'info');
      setAwaitingEmailCode(true);
      await refresh();
    });
  };

  const verifyRecoveryEmail = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await accountApi.verifyRecoveryEmail(recoveryEmailCode.trim());
      toast('Recovery email verified.');
      setAwaitingEmailCode(false);
      setRecoveryEmailCode('');
      await refresh();
    });
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast('Recovery codes copied.');
    } catch {
      toast('Unable to copy. Please select the codes manually.', 'error');
    }
  };

  const downloadCodes = () => {
    const url = URL.createObjectURL(new Blob([recoveryCodes.join('\n') + '\n'], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'kusshoes-recovery-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const enabled = Boolean(status?.enabled);
  const emailReady = Boolean(status?.recovery_email_verified);

  return (
    <div className={`${panel.panel} glass-panel`}>
      <div className={panel.panelHeader}>
        <Smartphone size={20} className={panel.panelIcon} />
        <div>
          <h4 className={panel.panelTitle}>Two-Factor Authentication (2FA)</h4>
          <p className={panel.panelDesc}>Require a second step when signing in, on top of your password.</p>
        </div>
        <span className={`${panel.badge} ${enabled ? panel.badgeOn : panel.badgeOff} ${panel.headerAction}`}>
          {enabled ? `On · ${status?.method === 'email' ? 'Email' : 'Authenticator'}` : 'Off'}
        </span>
      </div>

      {view === 'idle' && (
        <div className={panel.actions}>
          {enabled ? (
            <button type="button" className="btn-outline" onClick={() => setView('disable')}>
              <ShieldOff size={16} /> Turn off 2FA
            </button>
          ) : (
            <button type="button" className="btn-neon-orange" onClick={() => setView('choose')} disabled={!status}>
              <ShieldCheck size={16} /> Set up 2FA
            </button>
          )}
        </div>
      )}

      {view === 'choose' && (
        <>
          <div className={panel.methodGrid}>
            <div
              className={styles.radioCard}
              role="button"
              tabIndex={0}
              onClick={() => !busy && void startSetup('totp')}
              onKeyDown={(event) => event.key === 'Enter' && !busy && void startSetup('totp')}
            >
              <Smartphone size={20} className={panel.panelIcon} />
              <div>
                <h4 className={styles.radioTitle}>Authenticator app</h4>
                <p className={styles.radioDesc}>Google Authenticator, 1Password, Authy… Works offline.</p>
              </div>
            </div>
            <div
              className={styles.radioCard}
              role="button"
              tabIndex={0}
              style={emailReady ? undefined : { opacity: 0.5 }}
              onClick={() => {
                if (busy) return;
                if (!emailReady) {
                  toast('Verify a recovery email below before using email codes.', 'info');
                  return;
                }
                void startSetup('email');
              }}
              onKeyDown={(event) => event.key === 'Enter' && !busy && emailReady && void startSetup('email')}
            >
              <Mail size={20} className={panel.panelIcon} />
              <div>
                <h4 className={styles.radioTitle}>Email code</h4>
                <p className={styles.radioDesc}>We email a code each time you sign in. Needs a verified recovery email.</p>
              </div>
            </div>
          </div>
          <div className={panel.actions}>
            <button type="button" className="btn-outline" onClick={() => setView('idle')}>Cancel</button>
          </div>
        </>
      )}

      {view === 'confirm' && setup && (
        <form onSubmit={enable} className={panel.stack}>
          {setup.method === 'totp' ? (
            <>
              <p className={panel.panelDesc}>
                In your authenticator app add a new account, choose &ldquo;enter a setup key&rdquo;, and paste this key:
              </p>
              <div className={panel.codeBlock}>{setup.totp_secret}</div>
              {setup.provisioning_uri && (
                <a className={panel.muted} href={setup.provisioning_uri}>
                  Open in an authenticator app on this device
                </a>
              )}
            </>
          ) : (
            <p className={panel.panelDesc}>Enter the 6-digit code we just sent to your email.</p>
          )}
          <div className={panel.inlineForm}>
            <div className={panel.field}>
              <label htmlFor="tfa-confirm-code">6-digit code</label>
              <input
                id="tfa-confirm-code"
                className={styles.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" className="btn-neon-orange" disabled={busy || code.length !== 6}>
              Turn on 2FA
            </button>
            <button type="button" className="btn-outline" onClick={() => setView('idle')} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view === 'recoveryCodes' && (
        <div className={panel.stack}>
          <div className={panel.warn}>
            <AlertTriangle size={18} />
            <span>
              Save these one-time recovery codes now. Each works once if you lose access to your second factor, and
              they will not be shown again.
            </span>
          </div>
          <div className={panel.recoveryGrid}>
            {recoveryCodes.map((item) => (
              <div key={item} className={panel.codeBlock}>{item}</div>
            ))}
          </div>
          <div className={panel.actions}>
            <button type="button" className="btn-outline" onClick={copyCodes}><Copy size={16} /> Copy</button>
            <button type="button" className="btn-outline" onClick={downloadCodes}><Download size={16} /> Download</button>
            <button
              type="button"
              className="btn-neon-orange"
              onClick={() => {
                setRecoveryCodes([]);
                setView('idle');
              }}
            >
              I have saved them
            </button>
          </div>
        </div>
      )}

      {view === 'disable' && (
        <form onSubmit={disable} className={panel.stack}>
          <p className={panel.panelDesc}>
            Confirm with your password and a current 2FA code. Accounts that sign in with Google only need the code.
          </p>
          <div className={panel.inlineForm}>
            <div className={panel.field}>
              <label htmlFor="tfa-disable-password">Password</label>
              <input
                id="tfa-disable-password"
                type="password"
                className={styles.input}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className={panel.field}>
              <label htmlFor="tfa-disable-code">2FA code</label>
              <input
                id="tfa-disable-code"
                className={styles.input}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <div className={panel.actions}>
            <button type="submit" className="btn-neon-orange" disabled={busy || (!password && code.length !== 6)}>
              Turn off 2FA
            </button>
            <button type="button" className="btn-outline" onClick={() => setView('idle')} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Recovery email (needed for email-code 2FA, BR-13) */}
      <div className={panel.row}>
        <div className={panel.rowMain}>
          <span className={panel.rowTitle}>Recovery email</span>
          <span className={panel.rowMeta}>
            {status?.recovery_email
              ? `${status.recovery_email} · ${emailReady ? 'verified' : 'not verified'}`
              : 'Not set'}
          </span>
        </div>
      </div>
      {awaitingEmailCode ? (
        <form onSubmit={verifyRecoveryEmail} className={panel.inlineForm}>
          <div className={panel.field}>
            <label htmlFor="recovery-email-code">Code sent to {recoveryEmail || 'your recovery email'}</label>
            <input
              id="recovery-email-code"
              className={styles.input}
              inputMode="numeric"
              maxLength={6}
              value={recoveryEmailCode}
              onChange={(event) => setRecoveryEmailCode(event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button type="submit" className="btn-neon-orange" disabled={busy || recoveryEmailCode.length < 6}>Verify</button>
          <button type="button" className="btn-outline" onClick={() => setAwaitingEmailCode(false)} disabled={busy}>Cancel</button>
        </form>
      ) : (
        <form onSubmit={saveRecoveryEmail} className={panel.inlineForm}>
          <div className={panel.field}>
            <label htmlFor="recovery-email">{status?.recovery_email ? 'Change recovery email' : 'Add a recovery email'}</label>
            <input
              id="recovery-email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={recoveryEmail}
              onChange={(event) => setRecoveryEmail(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-outline" disabled={busy || !recoveryEmail.includes('@')}>Send code</button>
        </form>
      )}
    </div>
  );
};
