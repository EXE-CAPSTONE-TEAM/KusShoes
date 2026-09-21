import React, { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import { api, type ImpersonationSession } from '../../api/client';
import styles from './ImpersonationBanner.module.css';

interface ImpersonationBannerProps {
  /** Called after the session has ended so the app can return to the admin panel. */
  onEnded: () => void;
}

/** Persistent warning while an admin is acting as a customer (BR-80). */
export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({ onEnded }) => {
  const [session, setSession] = useState<ImpersonationSession | null>(api.impersonation());
  const [ending, setEnding] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => api.onImpersonationChange(() => setSession(api.impersonation())), []);

  useEffect(() => {
    if (!session) return;
    const tick = () => setMinutesLeft(Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 60_000)));
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    document.body.style.paddingTop = session ? '44px' : '';
    return () => {
      document.body.style.paddingTop = '';
    };
  }, [session]);

  if (!session) return null;

  const end = async () => {
    setEnding(true);
    await api.endImpersonation();
    setEnding(false);
    onEnded();
  };

  return (
    <div className={styles.banner} role="alert">
      <UserCog size={16} />
      <span className={styles.text}>
        {session.banner}
        {minutesLeft !== null && ` · còn khoảng ${minutesLeft} phút`}
      </span>
      <button type="button" className={styles.endBtn} onClick={end} disabled={ending}>
        {ending ? 'Đang kết thúc...' : 'Kết thúc phiên'}
      </button>
    </div>
  );
};
