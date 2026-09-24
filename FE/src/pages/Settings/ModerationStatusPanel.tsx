import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { accountApi, type MyModerationStatus } from '../../api/account';
import { useToast } from '../../context/ToastContext';
import panel from './AccountPanels.module.css';

const LEVEL_LABEL: Record<number, string> = {
  1: 'Warning issued',
  2: 'Public sharing restricted',
  3: 'Account suspended',
};

/** BR-77: shown only when there is something to report — clean accounts see nothing. */
export const ModerationStatusPanel: React.FC = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<MyModerationStatus | null>(null);

  useEffect(() => {
    accountApi.myModerationStatus().catch((caught) => {
      toast(caught instanceof Error ? caught.message : 'Unable to load moderation status.', 'error');
      return null;
    }).then((result) => {
      if (result) setStatus(result);
    });
  }, [toast]);

  if (!status || (status.level === 0 && !status.is_restricted && !status.is_banned)) return null;

  return (
    <div className={`${panel.panel} glass-panel`}>
      <div>
        <h4 className={panel.panelTitle}>Content standing</h4>
        <p className={panel.panelDesc}>Outcome of copyright/trademark reports against your account (BR-77).</p>
      </div>
      <div className={panel.warn}>
        {status.is_banned ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
        <div>
          <strong>{status.is_banned ? 'Account suspended' : LEVEL_LABEL[status.level] ?? 'Under review'}</strong>
          {status.is_restricted && status.restricted_until && (
            <p>
              Public sharing (artisan links) is restricted until{' '}
              {new Date(status.restricted_until).toLocaleDateString()}.
            </p>
          )}
          {status.is_banned && <p>Your account has been suspended following repeated upheld reports.</p>}
        </div>
      </div>
    </div>
  );
};
