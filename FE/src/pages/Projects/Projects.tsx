import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  Grid,
  List,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Smartphone,
  Laptop,
  CheckSquare,
  Square,
  Lock,
  Footprints,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../../components/Select/Select';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject } from '../../api/client';
import {
  SOURCE_MODEL_ACCEPT,
  SOURCE_MODEL_MAX_BYTES,
  importSourceModel,
  inferSourceModelContentType,
} from '../../api/sourceModel';
import { formatDateTime, formatRelativeTime } from '../../utils/format';
import { ProjectsEmptyState } from './ProjectsEmptyState';
import { ProjectTrashPanel } from './ProjectTrashPanel';
import styles from './Projects.module.css';

const SORT_OPTIONS = [
  { value: 'date', label: 'Last edited' },
  { value: 'name', label: 'Alphabetical (A-Z)' },
  { value: 'size', label: 'File Size' },
];

const BASE_MODEL_ALL = 'All';

type ProjectStatusFilter = 'All' | 'Scanned' | 'Designing' | 'Completed';
type ProjectSortBy = 'name' | 'date' | 'size';
type ProjectViewMode = 'grid' | 'list';
type WizardStep = 1 | 2 | 3;
// 'blank': empty project, the base shoe is picked in KusStudio. Mobile scans create their own project.
type WizardSource = 'blank' | 'upload';
// Real steps of the final wizard action; 'uploading' only runs for the .GLB source.
type WizardLaunchStep = 'idle' | 'creating' | 'uploading' | 'launching' | 'launched' | 'error';

interface ProjectsProps {
  projects: PortalProject[];
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
  /** `tab` opens the details page on that tab (e.g. 'share' for the artisan share links). */
  onViewDetails: (id: string, tab?: 'share') => void;
  initialFilter?: ProjectStatusFilter;
  /** True while the project list is being fetched. */
  loading?: boolean;
}

function isProjectSortBy(value: string): value is ProjectSortBy {
  return SORT_OPTIONS.some((option) => option.value === value);
}

export const Projects: React.FC<ProjectsProps> = ({
  projects,
  setProjects,
  onViewDetails,
  initialFilter,
  loading = false,
}) => {
  const { toast } = useToast();
  // View states
  const [viewMode, setViewMode] = useState<ProjectViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>(initialFilter || 'All');
  const [sortBy, setSortBy] = useState<ProjectSortBy>('date');
  const [baseModelFilter, setBaseModelFilter] = useState<string>(BASE_MODEL_ALL);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Option dropdowns
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [editingProject, setEditingProject] = useState<PortalProject | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation dialog state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);

  // Trash panel (BR-47: restore a soft-deleted project within 30 days)
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Step-Wizard (New Project) States
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSource, setWizardSource] = useState<WizardSource>('blank');

  // Trigger wizard if new=true parameter is present in browser query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'true') {
      setIsCreateWizardOpen(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 inputs
  const [wizardName, setWizardName] = useState('');
  const [wizardBaseModel, setWizardBaseModel] = useState('');

  // Step 3: create the project, import the uploaded model, then open KusStudio
  const [wizardLaunchStep, setWizardLaunchStep] = useState<WizardLaunchStep>('idle');
  const [wizardFailedStep, setWizardFailedStep] = useState<WizardLaunchStep | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  // Kept across a retry so a failed upload/launch never creates a second project.
  const [wizardCreatedProject, setWizardCreatedProject] = useState<PortalProject | null>(null);
  const [wizardModelImported, setWizardModelImported] = useState(false);
  const wizardBusy =
    wizardLaunchStep === 'creating' ||
    wizardLaunchStep === 'uploading' ||
    wizardLaunchStep === 'launching';

  // File size utility for sorting
  const parseSizeInMb = (sizeStr: string) => {
    return parseFloat(sizeStr.replace(' MB', '')) || 0;
  };

  // Real base models present in the account — not a fixed list, so it never shows a model
  // the user doesn't actually have.
  const baseModelOptions = useMemo(() => {
    const unique = Array.from(new Set(projects.map((p) => p.baseModel))).sort((a, b) =>
      a.localeCompare(b),
    );
    return [
      { value: BASE_MODEL_ALL, label: 'All base models' },
      ...unique.map((model) => ({ value: model, label: model })),
    ];
  }, [projects]);

  // Filter & Sort
  const filteredAndSortedProjects = useMemo(() => {
    let result = projects.filter((proj) => {
      const matchesSearch =
        proj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proj.baseModel.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || proj.status === statusFilter;
      const matchesBaseModel =
        baseModelFilter === BASE_MODEL_ALL || proj.baseModel === baseModelFilter;
      return matchesSearch && matchesStatus && matchesBaseModel;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        return parseSizeInMb(b.fileSize) - parseSizeInMb(a.fileSize);
      } else {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [projects, searchTerm, statusFilter, baseModelFilter, sortBy]);

  // Bulk delete
  const handleBulkDelete = () => {
    setConfirmBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => api.deleteProject(id)));
    const deletedIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setProjects((prev) => prev.filter((p) => !deletedIds.includes(p.id)));
    setSelectedIds(ids.filter((id) => !deletedIds.includes(id)));
    if (deletedIds.length) toast(`Deleted ${deletedIds.length} project(s).`);
    if (deletedIds.length !== ids.length) toast('Some projects could not be deleted.', 'error');
  };

  // Single Delete
  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmSingleDelete = async () => {
    if (!confirmDeleteId) return;
    const projectId = confirmDeleteId;
    try {
      await api.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setActiveMenuId(null);
      setConfirmDeleteId(null);
      toast('Project moved to trash.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to delete project.', 'error');
    }
  };

  // Rename action
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject && renameValue.trim()) {
      try {
        const updated = await api.updateProject(editingProject.id, { name: renameValue.trim() });
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setEditingProject(null);
        setRenameValue('');
        toast('Project renamed.');
      } catch (caught) {
        toast(caught instanceof Error ? caught.message : 'Unable to rename project.', 'error');
      }
    }
  };

  // Toggle single card selection
  const handleSelectCard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Avoid opening project details.
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Select all items matching current filters
  const handleSelectAll = () => {
    const currentFilteredIds = filteredAndSortedProjects.map((p) => p.id);
    const allSelected = currentFilteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  // Open Details Page
  const handleCardClick = (project: PortalProject) => {
    onViewDetails(project.id);
  };

  // Wizard Upload triggering
  const handleCustomGLBTrigger = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!inferSourceModelContentType(file.name)) {
        toast('Only .glb and .gltf files are supported for the 3D model.', 'error');
        return;
      }
      if (file.size > SOURCE_MODEL_MAX_BYTES) {
        toast('This file is larger than the 500 MB limit for a 3D model.', 'error');
        return;
      }
      setUploadedFile(file);
      // Pre-fill Step 2 project details based on filename
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setWizardName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      setWizardBaseModel('Custom GLB Mesh');
    }
  };

  // Proceed from Wizard Step 1 to Step 2
  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (wizardSource === 'upload' && !uploadedFile) {
        toast('Choose a .glb or .gltf file to upload.', 'error');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (!wizardName.trim()) {
        toast('Please enter a project name.', 'error');
        return;
      }
      setWizardStep(3);
    }
  };

  const resetWizard = () => {
    setIsCreateWizardOpen(false);
    setWizardStep(1);
    setWizardName('');
    setWizardBaseModel('');
    setUploadedFile(null);
    setWizardLaunchStep('idle');
    setWizardFailedStep(null);
    setWizardError(null);
    setWizardCreatedProject(null);
    setWizardModelImported(false);
  };

  // Finalize Wizard: create the project, import the uploaded model, then open KusStudio.
  // Re-running after a failure resumes from the step that failed.
  const handleCreateProjectFinal = async () => {
    if (wizardBusy) return;
    setWizardError(null);
    setWizardFailedStep(null);
    let step: WizardLaunchStep = 'creating';
    try {
      let project = wizardCreatedProject;
      if (!project) {
        setWizardLaunchStep(step);
        const created = await api.createProject({
          name: wizardName.trim(),
          description: wizardBaseModel
            ? `Base model: ${wizardBaseModel}`
            : 'Created from the KusShoes web portal.',
        });
        project = created;
        setWizardCreatedProject(created);
        setProjects((prev) => [created, ...prev]);
      }

      if (wizardSource === 'upload' && uploadedFile && !wizardModelImported) {
        step = 'uploading';
        setWizardLaunchStep(step);
        await importSourceModel(project.id, uploadedFile);
        setWizardModelImported(true);
      }

      step = 'launching';
      setWizardLaunchStep(step);
      const launch = await api.createEditorLaunch(project.id);
      setWizardLaunchStep('launched');
      window.location.assign(launch.desktopUrl);
      toast(`Project "${project.name}" was created. Opening KusStudio...`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.';
      setWizardLaunchStep('error');
      setWizardFailedStep(step);
      setWizardError(message);
      toast(message, 'error');
    }
  };

  // Reset Wizard
  const handleCloseWizard = () => {
    if (wizardBusy) return;
    resetWizard();
  };

  const wizardLaunchOrder: WizardLaunchStep[] =
    wizardSource === 'upload' ? ['creating', 'uploading', 'launching'] : ['creating', 'launching'];
  const wizardLaunchLabels: Partial<Record<WizardLaunchStep, string>> = {
    creating: `Create project "${wizardName.trim() || 'Untitled'}"`,
    uploading: `Upload ${uploadedFile?.name ?? 'the 3D model'}`,
    launching: 'Open KusStudio Desktop',
  };
  const wizardCurrentIndex =
    wizardLaunchStep === 'launched'
      ? wizardLaunchOrder.length
      : wizardLaunchOrder.indexOf(
          wizardLaunchStep === 'error' && wizardFailedStep ? wizardFailedStep : wizardLaunchStep,
        );
  const wizardLaunchItems = wizardLaunchOrder.map((step, index) => ({
    step,
    label: wizardLaunchLabels[step] ?? step,
    state:
      wizardCurrentIndex < 0 || index > wizardCurrentIndex
        ? 'pending'
        : index < wizardCurrentIndex
          ? 'done'
          : wizardLaunchStep === 'error'
            ? 'failed'
            : 'active',
  }));

  const handleWizardBack = () => {
    setWizardStep(wizardStep === 3 ? 2 : 1);
  };

  return (
    <div className={styles.container}>
      {/* Floating Action Bar (FAB) for Bulk Actions */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            className={`${styles.bulkFAB} glass-panel`}
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className={styles.fabInfo}>
              <CheckSquare size={16} className={styles.fabSelectedIcon} />
              <span>
                <strong>{selectedIds.length}</strong> selected
              </span>
            </div>

            <div className={styles.fabActions}>
              <button
                className={`${styles.fabBtn} ${styles.fabDeleteBtn}`}
                onClick={handleBulkDelete}
              >
                Delete
              </button>

              <div className={styles.fabDivider} />

              <button
                className={styles.fabCancelBtn}
                onClick={() => setSelectedIds([])}
                title="Cancel selection"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row 1: title/count, search, primary action */}
      <div className={styles.headerBlock}>
        <div className={styles.headerTop}>
          <div className={styles.headerTitleGroup}>
            <h1 className={styles.title}>Projects</h1>
            <span className={styles.headerCount} aria-label={`${projects.length} projects`}>
              {projects.length}
            </span>
          </div>

          <div className={styles.headerActions}>
            <label className={styles.searchWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="search"
                placeholder="Search projects…"
                aria-label="Search projects"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </label>
            <button className={styles.newProjectBtn} onClick={() => setIsCreateWizardOpen(true)}>
              <Plus size={14} />
              New project
            </button>
          </div>
        </div>

        {/* Row 2: All (+ Trash), base-model filter, sort, view toggle */}
        <div className={styles.toolbar}>
          <nav className={styles.tabs} role="tablist" aria-label="Project filters">
            <button
              type="button"
              role="tab"
              aria-selected
              className={styles.tab}
            >
              All
            </button>
            <span className={styles.tabsDivider} aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={false}
              className={styles.tab}
              onClick={() => setIsTrashOpen(true)}
            >
              <Trash2 size={14} />
              Trash
            </button>
          </nav>

          <div className={styles.toolbarControls}>
            <Select
              value={baseModelFilter}
              onValueChange={setBaseModelFilter}
              options={baseModelOptions}
              ariaLabel="Filter by base model"
              triggerClassName={styles.controlTrigger}
            />
            <Select
              value={sortBy}
              onValueChange={(value) => {
                if (isProjectSortBy(value)) setSortBy(value);
              }}
              options={SORT_OPTIONS}
              ariaLabel="Sort projects"
              triggerClassName={styles.controlTrigger}
            />
            <div className={styles.segmented} role="group" aria-label="View mode">
              <button
                type="button"
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid view"
                className={styles.segmentBtn}
                onClick={() => setViewMode('grid')}
              >
                <Grid size={14} />
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
                className={styles.segmentBtn}
                onClick={() => setViewMode('list')}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid or List Views */}
      {viewMode === 'grid' ? (
        /* Grid View */
        <motion.div className={styles.grid} layout>
          <AnimatePresence mode="popLayout">
            {filteredAndSortedProjects.map((proj) => {
              const isSelected = selectedIds.includes(proj.id);
              return (
                <motion.div
                  key={proj.id}
                  className={styles.cardWrapper}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                >
                  <div
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick(proj)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(proj);
                      }
                    }}
                  >
                    {/* Thumbnail: flat canvas, contained product shot */}
                    <div className={styles.imgContainer}>
                      <button
                        className={`${styles.cardCheck} ${isSelected ? styles.cardCheckActive : ''}`}
                        onClick={(e) => handleSelectCard(e, proj.id)}
                        aria-label={isSelected ? 'Deselect project' : 'Select project'}
                      >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </button>
                      <img src={proj.imageUrl} alt={proj.name} className={styles.shoeImg} />
                      <span className={styles.thumbBadge}>{proj.fileSize}</span>
                    </div>

                    {/* Info: name + menu, model/edited meta, palette */}
                    <div className={styles.cardInfo}>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.cardName} title={proj.name}>
                          {proj.name}
                        </h3>
                        {proj.isLocked && (
                          <span
                            className={styles.lockedBadge}
                            title="Read-only after a plan downgrade. Upgrade to edit it again."
                          >
                            <Lock size={11} /> Read-only
                          </span>
                        )}
                        <div className={styles.cardHeaderMenu}>
                          <button
                            aria-label="More actions"
                            className={styles.optionsBtn}
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid opening project details.
                              setActiveMenuId(activeMenuId === proj.id ? null : proj.id);
                            }}
                          >
                            <MoreVertical size={14} />
                          </button>

                          {activeMenuId === proj.id && (
                            <div
                              className={`${styles.dropdown} glass-panel`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                disabled={proj.isLocked}
                                title={proj.isLocked ? 'Read-only project' : undefined}
                                onClick={() => {
                                  setEditingProject(proj);
                                  setRenameValue(proj.name);
                                  setActiveMenuId(null);
                                }}
                              >
                                <Edit3 size={14} /> Rename
                              </button>
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  onViewDetails(proj.id, 'share');
                                }}
                              >
                                <Share2 size={14} /> Share Link
                              </button>

                              <div className={styles.dropdownDivider} />



                              <button
                                className={styles.dropdownDeleteBtn}
                                disabled={proj.isLocked}
                                title={proj.isLocked ? 'Read-only project' : undefined}
                                onClick={() => handleDelete(proj.id)}
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={styles.metaRowCompact}>
                        <Footprints size={12} className={styles.metaIcon} />
                        <span className={styles.metaText} title={formatDateTime(proj.updatedAt)}>
                          {proj.baseModel} · Edited {formatRelativeTime(proj.updatedAt)}
                        </span>
                      </div>

                      <div className={styles.cardFooter}>
                        <div className={styles.swatchRow}>
                          <span
                            className={styles.swatch}
                            style={{ backgroundColor: proj.colorCode }}
                            title={`Primary color ${proj.colorCode}`}
                          />
                          {proj.accentColor && (
                            <span
                              className={styles.swatch}
                              style={{ backgroundColor: proj.accentColor }}
                              title={`Accent color ${proj.accentColor}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* List View (Table layout) */
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '45px' }}>
                  <button className={styles.tableHeadSelectBtn} onClick={handleSelectAll}>
                    {filteredAndSortedProjects.every((p) => selectedIds.includes(p.id)) ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th>Project Name</th>
                <th>Base Sneaker</th>
                <th>Source Device</th>
                <th>File Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredAndSortedProjects.map((proj) => {
                  const isSelected = selectedIds.includes(proj.id);
                  return (
                    <motion.tr
                      key={proj.id}
                      className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                      onClick={() => handleCardClick(proj)}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className={styles.rowCheck}
                          onClick={(e) => handleSelectCard(e, proj.id)}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td>
                        <div className={styles.tableProjectNameCol}>
                          <img src={proj.imageUrl} alt="" className={styles.rowThumbnail} />
                          <div>
                            <span className={styles.rowProjectName}>
                              {proj.name}
                              {proj.isLocked && (
                                <span
                                  className={styles.lockedBadge}
                                  title="Read-only after a plan downgrade. Upgrade to edit it again."
                                >
                                  <Lock size={11} /> Read-only
                                </span>
                              )}
                            </span>
                            <span
                              className={styles.rowProjectUpdated}
                              title={formatDateTime(proj.updatedAt)}
                            >
                              Updated {formatRelativeTime(proj.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className={styles.tableBaseCell}>{proj.baseModel}</td>
                      <td className={styles.tableDeviceCell}>
                        <div className={styles.deviceCellInfo}>
                          <Smartphone size={12} className={styles.deviceCellIcon} />
                          <span>{proj.device}</span>
                        </div>
                      </td>
                      <td className={styles.tableSizeCell}>{proj.fileSize}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={styles.rowActions}>
                          <button
                            onClick={() => onViewDetails(proj.id, 'share')}
                            title="Share link"
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            className={styles.rowDeleteBtn}
                            disabled={proj.isLocked}
                            onClick={() => handleDelete(proj.id)}
                            title={proj.isLocked ? 'Read-only project' : 'Delete project'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Minimalist Pagination */}
      {filteredAndSortedProjects.length > 0 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled>
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>

          <div className={styles.pageNumbers}>
            <button className={`${styles.pageNumberBtn} ${styles.activePage}`}>1</button>
          </div>

          <button className={styles.pageBtn} disabled>
            <span>Next</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredAndSortedProjects.length === 0 && (
        <ProjectsEmptyState
          loading={loading}
          totalProjects={projects.length}
          activeFilters={[
            ...(searchTerm.trim() ? [`\u201c${searchTerm.trim()}\u201d`] : []),
            ...(statusFilter !== 'All' ? [statusFilter] : []),
            ...(baseModelFilter !== BASE_MODEL_ALL ? [baseModelFilter] : []),
          ]}
          onCreate={() => setIsCreateWizardOpen(true)}
          onClearFilters={() => {
            setSearchTerm('');
            setStatusFilter('All');
            setBaseModelFilter(BASE_MODEL_ALL);
          }}
        />
      )}

      {/* Rename Modal */}
      {editingProject && (
        <div className={styles.modalBackdrop}>
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <h3 className={styles.modalTitle}>Rename Project</h3>
            <form onSubmit={handleRenameSubmit} className={styles.modalForm}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={styles.modalInput}
                autoFocus
              />
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setEditingProject(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-neon-orange">
                  Save changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Multi-step Create Project Modal Step-Wizard */}
      {isCreateWizardOpen && (
        <div className={styles.modalBackdrop}>
          <motion.div
            className={styles.wizardModal}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            {/* Header */}
            <div className={styles.wizardHeader}>
              <div>
                <span className={styles.wizardProgressText}>Step {wizardStep} of 3</span>
                <h3 className={styles.wizardTitle}>Create New Project</h3>
              </div>
              <button className={styles.wizardCloseBtn} onClick={handleCloseWizard}>
                <X size={18} />
              </button>
            </div>

            {/* Progress Bar indicator */}
            <div className={styles.progressBarWrapper}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${(wizardStep / 3) * 100}%` }}
              />
            </div>

            {/* Step Contents */}
            <div className={styles.wizardBody}>
              {/* STEP 1: Select model source */}
              {wizardStep === 1 && (
                <div className={styles.wizardStepContent}>
                  <h4 className={styles.wizardStepSubTitle}>Select 3D Mesh Source</h4>
                  <p className={styles.wizardStepDesc}>
                    Start from an empty project, or upload your own .glb / .gltf model.
                  </p>

                  {/* Select sources tab */}
                  <div className={styles.sourceSelectorTabs}>
                    <button
                      className={`${styles.sourceTab} ${wizardSource === 'blank' ? styles.sourceTabActive : ''}`}
                      onClick={() => setWizardSource('blank')}
                    >
                      <Plus size={16} />
                      <span>Start empty</span>
                    </button>
                    <button
                      className={`${styles.sourceTab} ${wizardSource === 'upload' ? styles.sourceTabActive : ''}`}
                      onClick={() => setWizardSource('upload')}
                    >
                      <Laptop size={16} />
                      <span>Upload a model</span>
                    </button>
                  </div>

                  {/* Sources Content */}
                  {wizardSource === 'blank' ? (
                    <div className={styles.sourceNote}>
                      Creates an empty project and opens it in KusStudio, where you pick the base
                      shoe. Phone scans don&apos;t need this wizard: each scan from the KusShoes app
                      already shows up in your projects.
                    </div>
                  ) : (
                    <div
                      className={`${styles.uploadZone} ${uploadedFile ? styles.uploadZoneCompleted : ''}`}
                      onClick={handleCustomGLBTrigger}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={SOURCE_MODEL_ACCEPT}
                        style={{ display: 'none' }}
                        aria-label="Upload 3D model file"
                      />
                      <Laptop size={32} className={styles.uploadZoneIcon} />
                      {uploadedFile ? (
                        <div className={styles.uploadedFileDetails}>
                          <span className={styles.uploadedFileName}>{uploadedFile.name}</span>
                          <span className={styles.uploadedFileSize}>
                            {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                          <span className={styles.uploadZoneTipActive}>Click to change file</span>
                        </div>
                      ) : (
                        <div>
                          <span className={styles.uploadZoneTitle}>Drag & Drop or browse file</span>
                          <span className={styles.uploadZoneTip}>
                            Supports .glb and .gltf models. Max 500 MB.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Metadata details */}
              {wizardStep === 2 && (
                <div className={styles.wizardStepContent}>
                  <h4 className={styles.wizardStepSubTitle}>Project Configuration</h4>
                  <p className={styles.wizardStepDesc}>
                    Give your sneaker project a title, set the base style, and privacy levels.
                  </p>

                  <div className={styles.wizardForm}>
                    <div className={styles.wizardInputGroup}>
                      <label>Project Name</label>
                      <input
                        type="text"
                        value={wizardName}
                        onChange={(e) => setWizardName(e.target.value)}
                        className={styles.modalInput}
                        placeholder="Air Force 1 Custom Classic"
                      />
                    </div>

                    <div className={styles.wizardInputGroup}>
                      <label>Base Model Name</label>
                      <input
                        type="text"
                        value={wizardBaseModel}
                        onChange={(e) => setWizardBaseModel(e.target.value)}
                        className={styles.modalInput}
                        placeholder="Nike Air Force 1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Create the project and open it in KusStudio */}
              {wizardStep === 3 && (
                <div className={styles.wizardStepContent}>
                  <h4 className={styles.wizardStepSubTitle}>Launch Design Studio</h4>
                  <p className={styles.wizardStepDesc}>
                    The project is created on the server
                    {wizardSource === 'upload' ? ', your 3D model is uploaded to it,' : ''} and
                    KusStudio Desktop opens with a one-time launch ticket.
                  </p>

                  <div className={styles.desktopConnectionWrapper}>
                    <div className={styles.mockupConnectionBox}>
                      <div className={`${styles.mockNode} ${styles.mockNodeActive}`}>
                        {wizardSource === 'upload' ? <Laptop size={20} /> : <Plus size={20} />}
                        <span>{wizardSource === 'upload' ? 'Your model' : 'Web project'}</span>
                      </div>

                      <div className={styles.mockLineConnection}>
                        {wizardBusy && <div className={styles.mockProgressLinePulse} />}
                      </div>

                      <div
                        className={`${styles.mockNode} ${wizardLaunchStep === 'launched' ? styles.mockNodeActive : styles.mockNodeIdle}`}
                      >
                        <Laptop size={20} />
                        <span>KusStudio</span>
                      </div>
                    </div>

                    <div className={styles.desktopConnectionLogs} role="status" aria-live="polite">
                      {wizardLaunchItems.map((item) => (
                        <div key={item.step} className={styles.connLogItem}>
                          {item.state === 'done' ? (
                            <Check size={14} className={styles.connCheck} />
                          ) : item.state === 'active' ? (
                            <RefreshCw className={styles.spinIcon} size={14} />
                          ) : item.state === 'failed' ? (
                            <X size={14} color="#ef4444" />
                          ) : (
                            <div className={styles.connLogCircleDot} />
                          )}
                          <span>{item.label}</span>
                        </div>
                      ))}
                      {wizardError && (
                        <div className={styles.connLogItem} role="alert" style={{ color: '#ef4444' }}>
                          <span>{wizardError}</span>
                        </div>
                      )}
                      {wizardLaunchStep === 'launched' && (
                        <div className={styles.connLogItem}>
                          <span>
                            KusStudio did not open? Install the desktop app, then use "Launch
                            KusStudio" on the project page.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className={styles.wizardFooter}>
              {wizardStep > 1 && !wizardCreatedProject ? (
                <button className="btn-outline" onClick={handleWizardBack} disabled={wizardBusy}>
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              ) : (
                <button className="btn-outline" onClick={handleCloseWizard} disabled={wizardBusy}>
                  {wizardCreatedProject ? 'Close' : 'Cancel'}
                </button>
              )}

              {wizardStep < 3 ? (
                <button className="btn-neon-orange" onClick={handleWizardNext}>
                  <span>Next Step</span>
                  <ArrowRight size={16} />
                </button>
              ) : wizardLaunchStep === 'launched' ? (
                <button className="btn-neon-orange" onClick={resetWizard}>
                  <Check size={18} />
                  <span>Done</span>
                </button>
              ) : (
                <button
                  className="btn-neon-orange"
                  onClick={() => void handleCreateProjectFinal()}
                  disabled={wizardBusy}
                  style={{ gap: '10px' }}
                >
                  {wizardBusy ? (
                    <>
                      <RefreshCw className={styles.spinIcon} size={18} />
                      <span>
                        {wizardLaunchStep === 'creating'
                          ? 'Creating project...'
                          : wizardLaunchStep === 'uploading'
                            ? 'Uploading model...'
                            : 'Opening KusStudio...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Laptop size={18} />
                      <span>{wizardLaunchStep === 'error' ? 'Retry' : 'Create & Launch KusStudio'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="Delete this project?"
        description="It will move to Trash and can be restored within 30 days. After that it's permanently removed."
        confirmLabel="Move to Trash"
        onConfirm={confirmSingleDelete}
      />

      <ConfirmDialog
        open={confirmBulkDeleteOpen}
        onOpenChange={setConfirmBulkDeleteOpen}
        title={`Delete ${selectedIds.length} selected projects?`}
        description="They will move to Trash and can be restored within 30 days. After that they're permanently removed."
        confirmLabel="Move to Trash"
        onConfirm={confirmBulkDelete}
      />

      <ProjectTrashPanel
        open={isTrashOpen}
        onOpenChange={setIsTrashOpen}
        onRestored={(restored) => setProjects((prev) => [restored, ...prev])}
      />
    </div>
  );
};
