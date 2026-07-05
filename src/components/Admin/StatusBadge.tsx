import React from 'react';
import styles from '../../pages/Admin/admin-shared.module.css';

type BadgeTone = 'ok' | 'warn' | 'danger' | 'muted' | 'info';

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: styles.badgeOk,
  warn: styles.badgeWarn,
  danger: styles.badgeDanger,
  muted: styles.badgeMuted,
  info: styles.badgeInfo,
};

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'ok',
  paid: 'ok',
  completed: 'ok',
  ok: 'ok',
  banned: 'danger',
  suspended: 'danger',
  failed: 'danger',
  cancelled: 'muted',
  refunded: 'info',
  pending: 'warn',
  queued: 'warn',
  processing: 'info',
  degraded: 'warn',
  expired: 'muted',
  draft: 'muted',
  in_progress: 'info',
  baking: 'warn',
  admin: 'danger',
  staff: 'info',
  user: 'muted',
};

interface StatusBadgeProps {
  status: string;
  tone?: BadgeTone;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, tone, label }) => {
  const resolvedTone = tone ?? STATUS_TONE[status] ?? 'muted';
  return (
    <span className={`${styles.badge} ${TONE_CLASS[resolvedTone]}`}>
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
};
