import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorSmartphone, History, LogOut } from 'lucide-react';
import { accountApi, type LoginHistoryItem, type SessionInfo } from '../../api/account';
import { useToast } from '../../context/ToastContext';
import { describeUserAgent, formatDateTime } from '../../utils/format';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import panel from './AccountPanels.module.css';

/** Active sessions (revocable) and the recent sign-in history (BR-18). */
export const SessionsPanel: React.FC = () => {
  const { t } = useTranslation('account');
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [history, setHistory] = useState<LoginHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [activeSessions, recent] = await Promise.all([
        accountApi.listSessions(),
        accountApi.loginHistory(),
      ]);
      setSessions(activeSessions);
      setHistory(recent);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('sessions.loadError'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setBusy(true);
    try {
      await accountApi.revokeSession(sessionId);
      toast(t('sessions.revokeOk'));
      await load();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('sessions.revokeError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    try {
      await accountApi.revokeAllSessions();
      toast(t('sessions.revokeAllOk'), 'info');
      window.setTimeout(() => window.location.assign('/login'), 800);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('sessions.revokeAllError'), 'error');
      setBusy(false);
    }
  };

  return (
    <>
      <div className={panel.panel}>
        <div className={panel.panelHeader}>
          <MonitorSmartphone size={16} className={panel.panelIcon} />
          <div>
            <h4 className={panel.panelTitle}>{t('sessions.activeTitle')}</h4>
            <p className={panel.panelDesc}>{t('sessions.activeDesc')}</p>
          </div>
          <button
            type="button"
            className={`${panel.secondaryBtn} ${panel.headerAction}`}
            onClick={revokeAll}
            disabled={busy || !sessions?.length}
          >
            <LogOut size={14} /> {t('sessions.signOutAll')}
          </button>
        </div>
        {sessions === null ? (
          <LoadingDots center label={t('sessions.loading')} />
        ) : sessions.length === 0 ? (
          <p className={panel.muted}>{t('sessions.none')}</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className={panel.row}>
              <div className={panel.rowMain}>
                <span className={panel.rowTitle}>{describeUserAgent(session.user_agent)}</span>
                <span className={panel.rowMeta}>
                  {t('sessions.lastUsed', {
                    ip: session.ip_address ?? t('sessions.unknownIp'),
                    when: formatDateTime(session.last_used_at ?? session.created_at),
                  })}
                </span>
              </div>
              <button
                type="button"
                className={`${panel.secondaryBtn} ${panel.secondaryBtnSm}`}
                onClick={() => revoke(session.id)}
                disabled={busy}
              >
                {t('sessions.signOut')}
              </button>
            </div>
          ))
        )}
      </div>

      <div className={panel.panel}>
        <div className={panel.panelHeader}>
          <History size={16} className={panel.panelIcon} />
          <div>
            <h4 className={panel.panelTitle}>{t('sessions.historyTitle')}</h4>
            <p className={panel.panelDesc}>{t('sessions.historyDesc')}</p>
          </div>
        </div>
        {history === null ? (
          <LoadingDots center label={t('sessions.loadingHistory')} />
        ) : history.length === 0 ? (
          <p className={panel.muted}>{t('sessions.noHistory')}</p>
        ) : (
          <table className={panel.table}>
            <thead>
              <tr>
                <th>{t('sessions.colWhen')}</th>
                <th>{t('sessions.colResult')}</th>
                <th>{t('sessions.colDevice')}</th>
                <th>{t('sessions.colIp')}</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td className={item.success ? panel.ok : panel.fail}>
                    {item.success ? t('sessions.success') : t('sessions.failed')}
                  </td>
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
