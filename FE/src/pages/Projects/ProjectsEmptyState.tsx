import React from 'react';
import { Download, Footprints, FolderPlus, Laptop, Plus, SearchX, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
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

const STEPS = [
  { icon: FolderPlus, title: 'Create a project', text: 'Pick a base model or import your own 3D scan.' },
  { icon: Laptop, title: 'Design in KusStudio', text: 'Paint, add stickers and text on the 3D shoe.' },
  { icon: Download, title: 'Export & share', text: 'Download GLB/OBJ or send a link to your artisan.' },
];

/** Shown when the directory has nothing to list: a first-run welcome, or "no match" for the filters. */
export const ProjectsEmptyState: React.FC<ProjectsEmptyStateProps> = ({
  loading = false,
  totalProjects,
  activeFilters,
  onCreate,
  onClearFilters,
}) => {
  if (loading) {
    return (
      <div className={`${styles.wrap} glass-panel`} role="status" aria-live="polite">
        <div className={styles.skeletonRow}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
        <p className={styles.muted}>Loading your projects…</p>
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
        <h2 className={styles.title}>No projects match your filters</h2>
        <p className={styles.text}>
          {totalProjects === 1 ? 'You have 1 project' : `You have ${totalProjects} projects`}, but none fit
          {activeFilters.length > 0 ? ' the current search.' : ' this view.'}
        </p>
        {activeFilters.length > 0 && (
          <div className={styles.chips}>
            {activeFilters.map((filter) => (
              <span key={filter} className={styles.chip}>{filter}</span>
            ))}
          </div>
        )}
        <button type="button" className="btn-outline" onClick={onClearFilters}>
          Clear filters
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
      <h2 className={styles.title}>Your studio is empty</h2>
      <p className={styles.text}>
        Create your first project to start customising a 3D sneaker. It only takes a minute.
      </p>
      <button type="button" className="btn-neon-orange" onClick={onCreate}>
        <Plus size={18} />
        Create your first project
      </button>

      <ol className={styles.steps}>
        {STEPS.map(({ icon: Icon, title, text }, index) => (
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
