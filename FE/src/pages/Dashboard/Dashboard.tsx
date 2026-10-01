import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Download, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  api,
  type PortalProject,
  type Subscription,
  type Usage,
  type UserProfile,
} from '../../api/client';
import { formatBytes, formatDate, formatRelativeTime } from '../../utils/format';
import { DESKTOP_INSTALLER_URL } from '../../utils/desktopRelease';
import { useDesktopRelease } from '../../hooks/useDesktopRelease';
import styles from './Dashboard.module.css';

interface DashboardProps {
  setActivePage: (page: string) => void;
  projects: PortalProject[];
}

function greetingForHour(hour: number, t: TFunction): string {
  if (hour < 12) return t('dashboard.morning');
  if (hour < 18) return t('dashboard.afternoon');
  return t('dashboard.evening');
}

function formatTierLabel(tier: string): string {
  return tier
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

const UsageMetric: React.FC<{
  label: string;
  used: number;
  max: number | null;
  percent: number;
}> = ({ label, used, max, percent }) => {
  const { t } = useTranslation('account');
  return (
    <div className={styles.usageMetric}>
      <div className={styles.usageMetricRow}>
        <span>{label}</span>
        <span className={styles.usageMetricValue}>
          {max != null ? t('dashboard.usedOf', { used, max }) : t('dashboard.usedOnly', { used })}
        </span>
      </div>
      <div className={styles.usageBarBg}>
        <div className={styles.usageBarFill} style={{ width: `${max != null ? percent : 0}%` }} />
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ setActivePage, projects }) => {
  const { t } = useTranslation('account');
  const desktopRelease = useDesktopRelease();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    Promise.all([api.profile(), api.usage(), api.subscription().catch(() => null)])
      .then(([nextProfile, nextUsage, nextSubscription]) => {
        setProfile(nextProfile);
        setUsage(nextUsage);
        setSubscription(nextSubscription);
      })
      .catch(() => {
        // The global request client handles token refresh; page-level fallbacks remain visible.
      });
  }, []);

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username
    : t('dashboard.creator');
  const greeting = greetingForHour(new Date().getHours(), t);

  const sortedByRecent = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [projects],
  );
  const spotlightProject = sortedByRecent[0];
  const gridProjects = sortedByRecent.slice(1, 5);
  const recentActivity = sortedByRecent.slice(0, 5);
  // BR-27: a project left over after a plan downgrade is read-only until the user upgrades —
  // the closest real "needs attention" signal this app has, so it drives the hero's status line.
  const lockedCount = projects.filter((p) => p.isLocked).length;

  const openProject = (id: string) => setActivePage(`/project-details?id=${id}`);
  const handleCardKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProject(id);
    }
  };

  const maxProjects = usage?.max_projects ?? null;
  const maxExports = usage?.max_exports_per_month ?? null;
  const projectsUsed = usage?.projects_count ?? projects.length;
  const exportsUsed = usage?.exports_count ?? 0;
  const projectPercent = maxProjects ? Math.min(100, (projectsUsed / maxProjects) * 100) : 0;
  const exportPercent = maxExports ? Math.min(100, (exportsUsed / maxExports) * 100) : 0;

  return (
    <div className={styles.container}>
      {/* Hero */}
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.heroLeft}>
          <h1 className={styles.greeting}>
            {greeting}, {displayName}
          </h1>
          <p className={styles.statusLine}>
            <span className={styles.statusDot} />
            {lockedCount > 0 ? (
              <>{t('dashboard.readOnly', { count: lockedCount })}</>
            ) : (
              <>
                {t('dashboard.allSynced')} <span className={styles.statusDivider}>·</span>{' '}
                <span className={styles.statusStrong}>{projects.length}</span>{' '}
                {t('dashboard.total')}
              </>
            )}
          </p>
          <div className={styles.heroActions}>
            <button
              className={styles.primaryBtn}
              onClick={() => setActivePage('projects?new=true')}
            >
              <Plus size={16} />
              <span>{t('dashboard.newProject')}</span>
            </button>
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button className={styles.secondaryBtn}>
                  <Download size={16} />
                  <span>{t('dashboard.getDesktop')}</span>
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className={styles.dialogOverlay} />
                <Dialog.Content className={styles.dialogContent}>
                  <Dialog.Title className={styles.dialogTitle}>
                    {t('dashboard.editorTitle')}
                    {desktopRelease?.status === 'available' ? ` v${desktopRelease.version}` : ''}
                  </Dialog.Title>
                  <Dialog.Description className={styles.dialogDescription}>
                    {t('dashboard.editorDesc')}
                  </Dialog.Description>
                  {desktopRelease?.status === 'none' ? (
                    <p className={styles.dialogDescription}>{t('dashboard.installerSoon')}</p>
                  ) : (
                    <ol className={styles.dialogSteps}>
                      <li>
                        <Trans
                          t={t}
                          i18nKey="dashboard.step1"
                          components={{ strong: <strong /> }}
                        />
                      </li>
                      <li>
                        <Trans
                          t={t}
                          i18nKey="dashboard.step2"
                          components={{ strong: <strong /> }}
                        />
                      </li>
                      <li>
                        <Trans
                          t={t}
                          i18nKey="dashboard.step3"
                          components={{ strong: <strong /> }}
                        />
                      </li>
                    </ol>
                  )}
                  <div className={styles.dialogActions}>
                    <Dialog.Close asChild>
                      <button className={styles.secondaryBtn}>{t('dashboard.cancel')}</button>
                    </Dialog.Close>
                    {desktopRelease?.status !== 'none' ? (
                      <Dialog.Close asChild>
                        <a className={styles.primaryBtn} href={DESKTOP_INSTALLER_URL} download>
                          <Download size={16} />
                          <span>{t('dashboard.downloadWin')}</span>
                        </a>
                      </Dialog.Close>
                    ) : null}
                  </div>
                  <Dialog.Close asChild>
                    <button className={styles.dialogCloseIcon} aria-label={t('dashboard.close')}>
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>

        {spotlightProject && (
          <div className={styles.heroRight}>
            <div className={styles.spotlightLabel}>{t('dashboard.lastEdited')}</div>
            <div
              className={styles.spotlightThumb}
              role="button"
              tabIndex={0}
              onClick={() => openProject(spotlightProject.id)}
              onKeyDown={(e) => handleCardKeyDown(e, spotlightProject.id)}
            >
              <img src={spotlightProject.imageUrl} alt={spotlightProject.name} />
              <span className={styles.thumbBadge}>{spotlightProject.fileSize}</span>
            </div>
            <div className={styles.spotlightMeta}>
              <div className={styles.spotlightInfo}>
                <div className={styles.spotlightName} title={spotlightProject.name}>
                  {spotlightProject.name}
                </div>
                <div className={styles.spotlightSub} title={formatDate(spotlightProject.updatedAt)}>
                  {spotlightProject.baseModel} ·{' '}
                  {t('dashboard.editedAgo', {
                    when: formatRelativeTime(spotlightProject.updatedAt),
                  })}
                </div>
              </div>
              <div className={styles.spotlightActions}>
                <div className={styles.swatchRow} title={t('dashboard.colorway')}>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: spotlightProject.colorCode }}
                  />
                  {spotlightProject.accentColor && (
                    <span
                      className={styles.swatch}
                      style={{ backgroundColor: spotlightProject.accentColor }}
                    />
                  )}
                </div>
                <button className={styles.openBtn} onClick={() => openProject(spotlightProject.id)}>
                  <span>{t('dashboard.openProject')}</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Continue designing */}
      {gridProjects.length > 0 && (
        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>{t('dashboard.continue')}</h2>
            <button className={styles.viewAllLink} onClick={() => setActivePage('projects')}>
              <span>{t('dashboard.viewAll')}</span>
              <ArrowRight size={12} />
            </button>
          </div>
          <div className={styles.projectGrid}>
            {gridProjects.map((proj) => (
              <article
                key={proj.id}
                className={styles.projectCard}
                role="button"
                tabIndex={0}
                onClick={() => openProject(proj.id)}
                onKeyDown={(e) => handleCardKeyDown(e, proj.id)}
              >
                <div className={styles.projectThumb}>
                  <img src={proj.imageUrl} alt={proj.name} />
                  <span className={styles.thumbBadge}>{proj.fileSize}</span>
                </div>
                <div className={styles.projectBody}>
                  <div className={styles.projectName} title={proj.name}>
                    {proj.name}
                  </div>
                  <div className={styles.projectMeta} title={formatDate(proj.updatedAt)}>
                    {proj.baseModel} ·{' '}
                    {t('dashboard.editedAgo', { when: formatRelativeTime(proj.updatedAt) })}
                  </div>
                  <div className={styles.swatchRow} title={t('dashboard.colorway')}>
                    <span className={styles.swatch} style={{ backgroundColor: proj.colorCode }} />
                    {proj.accentColor && (
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: proj.accentColor }}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity + Usage */}
      <div className={styles.bottomGrid}>
        <div className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{t('dashboard.recent')}</h3>
          </div>
          <div className={styles.activityList}>
            {recentActivity.length === 0 && (
              <div className={styles.emptyState}>{t('dashboard.noProjects')}</div>
            )}
            {recentActivity.map((proj) => (
              <div key={proj.id} className={styles.activityRow}>
                <div className={styles.activityLeft}>
                  <img src={proj.imageUrl} alt="" className={styles.activityThumb} />
                  <div className={styles.activityInfo}>
                    <div className={styles.activityName} title={proj.name}>
                      {proj.name}
                    </div>
                    <div className={styles.activityTime} title={formatDate(proj.updatedAt)}>
                      {t('dashboard.editedAgo', { when: formatRelativeTime(proj.updatedAt) })}
                    </div>
                  </div>
                </div>
                <button className={styles.activityOpenBtn} onClick={() => openProject(proj.id)}>
                  {t('dashboard.open')}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.usageCard}>
          <div>
            <div className={styles.usageHeader}>
              <div>
                <div className={styles.usageTier}>{formatTierLabel(usage?.tier ?? 'free')}</div>
                {subscription?.expires_at && (
                  <div className={styles.usageRenew}>
                    {t('dashboard.renews', { date: formatDate(subscription.expires_at) })}
                  </div>
                )}
              </div>
              <button className={styles.manageLink} onClick={() => setActivePage('billing')}>
                {t('dashboard.managePlan')}
              </button>
            </div>
            <div className={styles.usageDivider} />
            <div className={styles.usageMetrics}>
              <UsageMetric
                label={t('dashboard.projects')}
                used={projectsUsed}
                max={maxProjects}
                percent={projectPercent}
              />
              <UsageMetric
                label={t('dashboard.exportsMonth')}
                used={exportsUsed}
                max={maxExports}
                percent={exportPercent}
              />
              <div className={styles.usageMetric}>
                <div className={styles.usageMetricRow}>
                  <span>{t('dashboard.storage')}</span>
                  {/* No plan has a storage limit, so this is a used-only figure without a bar. */}
                  <span className={styles.usageMetricValue}>
                    {usage
                      ? t('dashboard.storageUsed', { size: formatBytes(usage.storage_used_bytes) })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.usageFooter}>
            <span>{t('dashboard.needQuota')}</span>
            <button className={styles.manageLink} onClick={() => setActivePage('billing')}>
              {t('dashboard.addOns')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
