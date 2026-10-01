import React from 'react';
import { Download, Footprints, FolderPlus, Laptop, Plus, SearchX, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './ProjectsEmptyState.module.css';

interface ProjectsEmptyStateProps {
  /** True while the first page of projects is still loading (avoids flashing "empty"). */
  loading?: boolean;
  /** Number of projects the account has before filters are applied. */
  totalProjects: number;
  /** Human-readable description of the active filters, e.g. `"nike", Designing`. */
  activeFilters: string[];
  onCreate: () => void;
  onClearFilters: () => void;
}

const STEP_ICONS = [FolderPlus, Laptop, Download];

/** Shown when the directory has nothing to list: a first-run welcome, or "no match" for the filters. */
export const ProjectsEmptyState: React.FC<ProjectsEmptyStateProps> = ({
  loading = false,
  totalProjects,
  activeFilters,
  onCreate,
  onClearFilters,
}) => {
  const { t } = useTranslation('projects');
  const steps = STEP_ICONS.map((icon, index) => ({
    icon,
    title: t(`empty.step${index + 1}Title`),
    text: t(`empty.step${index + 1}Text`),
  }));

  if (loading) {
    return (
      <div className={`${styles.wrap} glass-panel`} role="status" aria-live="polite">
        <div className={styles.skeletonRow}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
        <LoadingDots center label={t('empty.loading')} role={null} />
      </div>
    );
  }

  if (totalProjects > 0) {
    return (
      <motion.div
        className={`${styles.wrap} glass-panel`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.iconRing}>
          <SearchX size={30} />
        </div>
        <h2 className={styles.title}>{t('empty.noMatchTitle')}</h2>
        <p className={styles.text}>
          {t(activeFilters.length > 0 ? 'empty.matchSearch' : 'empty.matchView', {
            count: totalProjects,
          })}
        </p>
        {activeFilters.length > 0 && (
          <div className={styles.chips}>
            {activeFilters.map((filter) => (
              <span key={filter} className={styles.chip}>{filter}</span>
            ))}
          </div>
        )}
        <button type="button" className="btn-outline" onClick={onClearFilters}>
          {t('empty.clearFilters')}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`${styles.wrap} ${styles.welcome} glass-panel`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={`${styles.iconRing} ${styles.iconRingLarge}`}>
        <Footprints size={38} />
        <Sparkles size={16} className={styles.spark} />
      </div>
      <h2 className={styles.title}>{t('empty.title')}</h2>
      <p className={styles.text}>
        {t('empty.text')}
      </p>
      <button type="button" className="btn-neon-orange" onClick={onCreate}>
        <Plus size={18} />
        {t('empty.createFirst')}
      </button>

      <ol className={styles.steps}>
        {steps.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className={styles.step}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <Icon size={20} className={styles.stepIcon} />
            <span className={styles.stepTitle}>{title}</span>
            <span className={styles.stepText}>{text}</span>
          </li>
        ))}
      </ol>
    </motion.div>
  );
};
