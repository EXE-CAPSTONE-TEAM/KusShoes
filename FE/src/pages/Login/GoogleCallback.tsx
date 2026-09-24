import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { LoginBackdrop } from './LoginBackdrop';
import styles from './Login.module.css';

interface GoogleCallbackProps {
  setPage: (page: string) => void;
}

/**
 * Lands here after `GET /api/v1/auth/google/callback` redirects back with the session in the
 * URL fragment (never sent to a server, unlike a query string) — see completeGoogleLogin.
 */
export const GoogleCallback: React.FC<GoogleCallbackProps> = ({ setPage }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const tokenType = params.get('token_type') ?? 'bearer';
    // Drop the token out of the URL/history immediately, whether or not it parsed.
    window.history.replaceState({}, '', '/auth/google/callback');

    if (!accessToken) {
      setError('Google sign-in did not complete. Please try again.');
      return;
    }
    api.completeGoogleLogin(accessToken, tokenType);
    setPage('dashboard');
  }, [setPage]);

  return (
    <div className={styles.container}>
      <LoginBackdrop />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        {error ? (
          <>
            <p>{error}</p>
            <button className="btn-neon-orange" onClick={() => setPage('login')}>Back to sign in</button>
          </>
        ) : (
          <>
            <Loader2 size={28} className={styles.spin} />
            <p>Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
};
