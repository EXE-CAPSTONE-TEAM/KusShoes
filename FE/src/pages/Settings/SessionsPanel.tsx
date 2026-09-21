import React, { useCallback, useEffect, useState } from 'react';
import { MonitorSmartphone, History, LogOut } from 'lucide-react';
import { accountApi, type LoginHistoryItem, type SessionInfo } from '../../api/account';
import { useToast } from '../../context/ToastContext';
import { describeUserAgent, formatDateTime } from '../../utils/format';
import panel from './AccountPanels.module.css';

/** Active sessions (revocable) and the recent sign-in history (BR-18). */
export const SessionsPanel: React.FC = () => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [history, setHistory] = useState<LoginHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [activeSessions, recent] = await Promise.all([accountApi.listSessions(), accountApi.loginHistory()]);
      setSessions(activeSessions);
      setHistory(recent);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to load sessions.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setBusy(true);
    try {
      await accountApi.revokeSession(sessionId);
      toast('Session signed out.');
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to sign out that session.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    try {
      await accountApi.revokeAllSessions();
      toast('Signed out of every device. Please sign in again.', 'info');
      window.setTimeout(() => window.location.assign('/login'), 800);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to sign out.', 'error');
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`${panel.panel} glass-panel`}>
        <div className={panel.panelHeader}>
          <MonitorSmartphone size={20} className={panel.panelIcon} />
          <div>
            <h4 className={panel.panelTitle}>Active sessions</h4>
            <p className={panel.panelDesc}>Devices currently signed in to your account.</p>
          </div>
          <button
            type="button"
            className={`btn-outline ${panel.headerAction}`}
            onClick={revokeAll}
            disabled={busy || !sessions?.length}
          >
            <LogOut size={16} /> Sign out everywhere
          </button>
        </div>
        {sessions === null ? (
          <p className={panel.muted}>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className={panel.muted}>No active sessions.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className={panel.row}>
              <div className={panel.rowMain}>
                <span className={panel.rowTitle}>{describeUserAgent(session.user_agent)}</span>
                <span className={panel.rowMeta}>
                  {session.ip_address ?? 'Unknown IP'} · last used {formatDateTime(session.last_used_at ?? session.created_at)}
                </span>
              </div>
              <button type="button" className="btn-outline" onClick={() => revoke(session.id)} disabled={busy}>
                Sign out
              </button>
            </div>
          ))
        )}
      </div>

      <div className={`${panel.panel} glass-panel`}>
        <div className={panel.panelHeader}>
          <History size={20} className={panel.panelIcon} />
          <div>
            <h4 className={panel.panelTitle}>Recent sign-in activity</h4>
            <p className={panel.panelDesc}>The last 90 days. If you do not recognise an attempt, change your password.</p>
          </div>
        </div>
        {history === null ? (
          <p className={panel.muted}>Loading activity…</p>
        ) : history.length === 0 ? (
          <p className={panel.muted}>No sign-in activity recorded yet.</p>
        ) : (
          <table className={panel.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Result</th>
                <th>Device</th>
                <th>IP address</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td className={item.success ? panel.ok : panel.fail}>{item.success ? 'Success' : 'Failed'}</td>
                  <td>{describeUserAgent(item.user_agent)}</td>
                  <td>{item.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};
