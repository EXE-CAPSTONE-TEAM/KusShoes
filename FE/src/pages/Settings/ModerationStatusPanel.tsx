import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { accountApi, type MyModerationStatus } from '../../api/account';
import { useToast } from '../../context/ToastContext';
import panel from './AccountPanels.module.css';

/** BR-77: shown only when there is something to report — clean accounts see nothing. */
export const ModerationStatusPanel: React.FC = () => {
  const { t } = useTranslation('account');
  const { toast } = useToast();
  const [status, setStatus] = useState<MyModerationStatus | null>(null);

  useEffect(() => {
    accountApi
      .myModerationStatus()
      .catch((caught) => {
        toast(caught instanceof Error ? caught.message : t('moderation.loadError'), 'error');
        return null;
      })
      .then((result) => {
        if (result) setStatus(result);
      });
  }, [toast, t]);

  if (!status || (status.level === 0 && !status.is_restricted && !status.is_banned)) return null;

  return (
    <div className={panel.panel}>
      <div>
        <h4 className={panel.panelTitle}>{t('moderation.title')}</h4>
        <p className={panel.panelDesc}>{t('moderation.desc')}</p>
      </div>
      <div className={panel.warn}>
        {status.is_banned ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
        <div>
          <strong>
            {status.is_banned
              ? t('moderation.level3')
              : [1, 2, 3].includes(status.level)
                ? t(`moderation.level${status.level}`)
                : t('moderation.underReview')}
          </strong>
          {status.is_restricted && status.restricted_until && (
            <p>
              {t('moderation.restricted', {
                date: new Date(status.restricted_until).toLocaleDateString(),
              })}
            </p>
          )}
          {status.is_banned && <p>{t('moderation.banned')}</p>}
        </div>
      </div>
    </div>
  );
};
