import React, { useState, useRef, useMemo } from 'react';
import { 
  Search, Plus, MoreVertical, Trash2, Edit3, Share2, 
  Globe, EyeOff, Link, Grid, List, Check, X, ArrowRight, 
  ArrowLeft, RefreshCw, Smartphone, Laptop, 
  ChevronRight, Download, CheckSquare, Square, Camera, Cpu 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Projects.module.css';

interface Project {
  id: string;
  name: string;
  baseModel: string;
  status: 'Scanned' | 'Designing' | 'Completed';
  visibility: 'Private' | 'Link' | 'Public';
  updatedAt: string;
  imageUrl: string;
  device: string;
  fileSize: string;
  photosCount: number;
  verticesCount: string;
  colorCode: string;
  description: string;
}

interface ProjectsProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  onViewDetails: (id: string) => void;
}

export const Projects: React.FC<ProjectsProps> = ({
  projects,
  setProjects,
  onViewDetails
}) => {
  // View states
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Scanned' | 'Designing' | 'Completed'>('All');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  
  // Selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Option dropdowns
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Modals
  const [sharingProject, setSharingProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Step-Wizard (New Project) States
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardSource, setWizardSource] = useState<'cloud' | 'upload'>('cloud');
  
  // Synced Cloud Scans for Step 1
  const mockCloudScans = [
    { id: 'cs-1', name: 'Scan #19 - Air Jordan 1 Retro', date: '10 mins ago', size: '72.4 MB', photos: 118, device: 'iPhone 15 Pro' },
    { id: 'cs-2', name: 'Scan #18 - Adidas Campus 00s', date: '1 hour ago', size: '48.1 MB', photos: 72, device: 'iPad Pro' },
    { id: 'cs-3', name: 'Scan #17 - Nike Air Max 90', date: 'Yesterday', size: '58.9 MB', photos: 90, device: 'Samsung Galaxy Fold' },
    { id: 'cs-4', name: 'Scan #16 - Converse Chuck 70', date: '3 days ago', size: '36.5 MB', photos: 60, device: 'iPhone 14 Pro' },
  ];
  
  const [selectedCloudScan, setSelectedCloudScan] = useState<string>('cs-1');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2 inputs
  const [wizardName, setWizardName] = useState('');
  const [wizardBaseModel, setWizardBaseModel] = useState('');
  const [wizardVisibility, setWizardVisibility] = useState<'Private' | 'Link' | 'Public'>('Private');
  
  // Step 3 Desktop simulation state
  const [wizardDesktopStatus, setWizardDesktopStatus] = useState<'idle' | 'packaging' | 'launched'>('idle');

  // File size utility for sorting
  const parseSizeInMb = (sizeStr: string) => {
    return parseFloat(sizeStr.replace(' MB', '')) || 0;
  };

  // Filter & Sort
  const filteredAndSortedProjects = useMemo(() => {
    let result = projects.filter(proj => {
      const matchesSearch = proj.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            proj.baseModel.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || proj.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        return parseSizeInMb(b.fileSize) - parseSizeInMb(a.fileSize);
      } else {
        // Sort by Date updated (mock parsing order by id descending as newer)
        return parseInt(b.id) - parseInt(a.id);
      }
    });

    return result;
  }, [projects, searchTerm, statusFilter, sortBy]);

  // Bulk visibility update
  const handleBulkVisibility = (visibility: 'Private' | 'Link' | 'Public') => {
    setProjects(prev => prev.map(p => selectedIds.includes(p.id) ? { ...p, visibility } : p));
    alert(`Updated visibility to ${visibility} for ${selectedIds.length} projects.`);
    setSelectedIds([]);
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete the ${selectedIds.length} selected projects?`)) {
      setProjects(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
    }
  };

  // Bulk ZIP mock export
  const handleBulkExport = () => {
    alert(`Packaging ${selectedIds.length} projects into a ZIP folder containing high-poly GLTF models. Starting download...`);
    setSelectedIds([]);
  };

  // Single Delete
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      setProjects(prev => prev.filter(p => p.id !== id));
      setActiveMenuId(null);
    }
  };

  // Rename action
  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject && renameValue.trim()) {
      setProjects(prev => prev.map(p => p.id === editingProject.id ? { ...p, name: renameValue } : p));
      setEditingProject(null);
      setRenameValue('');
    }
  };

  // Toggle single card selection
  const handleSelectCard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Avoid opening drawer
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Select all items matching current filters
  const handleSelectAll = () => {
    const currentFilteredIds = filteredAndSortedProjects.map(p => p.id);
    const allSelected = currentFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !currentFilteredIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  // Open Details Page
  const handleCardClick = (project: Project) => {
    onViewDetails(project.id);
  };

  // Wizard Upload triggering
  const handleCustomGLBTrigger = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      // Pre-fill Step 2 project details based on filename
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setWizardName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      setWizardBaseModel("Custom GLB Mesh");
    }
  };

  // Proceed from Wizard Step 1 to Step 2
  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (wizardSource === 'cloud') {
        const selectedScan = mockCloudScans.find(s => s.id === selectedCloudScan);
        if (selectedScan) {
          // Pre-fill Step 2 details
          setWizardName(selectedScan.name.replace('Scan #', 'Project #'));
          setWizardBaseModel(selectedScan.name.split(' - ')[1] || 'Custom Base');
        }
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (!wizardName.trim()) {
        alert('Please enter a project name.');
        return;
      }
      setWizardStep(3);
    }
  };

  // Finalize Wizard & Create project
  const handleCreateProjectFinal = () => {
    setWizardDesktopStatus('packaging');
    setTimeout(() => {
      setWizardDesktopStatus('launched');
      
      // Assemble new project object
      const sourceScan = wizardSource === 'cloud' 
        ? mockCloudScans.find(s => s.id === selectedCloudScan) 
        : null;
        
      const newProj: Project = {
        id: Date.now().toString(),
        name: wizardName,
        baseModel: wizardBaseModel || 'Custom Sneaker Base',
        status: 'Designing', // Starts directly in Designing since we locked it on desktop
        visibility: wizardVisibility,
        updatedAt: 'Just now',
        imageUrl: wizardSource === 'cloud' 
          ? 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80'
          : 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=300&q=80',
        device: sourceScan?.device || 'Desktop Upload',
        fileSize: sourceScan?.size || (uploadedFile ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB` : '15.4 MB'),
        photosCount: sourceScan?.photos || 0,
        verticesCount: '280.000 points',
        colorCode: '#FF5A36', // Default Sneaker Flow Orange
        description: 'New custom design project synced directly to KusStudio Desktop. Buffers packaged from Cloud Vault.',
      };

      setProjects(prev => [newProj, ...prev]);
      
      setTimeout(() => {
        // Reset and close modal
        setIsCreateWizardOpen(false);
        setWizardStep(1);
        setWizardName('');
        setWizardBaseModel('');
        setWizardDesktopStatus('idle');
        setUploadedFile(null);
        alert(`New Project "${wizardName}" successfully added and synced to KusStudio Desktop client!`);
      }, 1000);
      
    }, 2000);
  };

  // Reset Wizard
  const handleCloseWizard = () => {
    setIsCreateWizardOpen(false);
    setWizardStep(1);
    setUploadedFile(null);
    setWizardDesktopStatus('idle');
  };

  return (
    <div className={styles.container}>
      {/* Contextual Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            className={`${styles.bulkBar} glass-panel`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.bulkInfo}>
              <CheckSquare size={18} className={styles.bulkSelectedIcon} />
              <span>Selected <strong>{selectedIds.length}</strong> items</span>
            </div>
            
            <div className={styles.bulkActions}>
              <div className={styles.bulkVisibilitySelector}>
                <span>Visibility:</span>
                <button onClick={() => handleBulkVisibility('Private')}>Private</button>
                <button onClick={() => handleBulkVisibility('Link')}>Link</button>
                <button onClick={() => handleBulkVisibility('Public')}>Public</button>
              </div>
              
              <div className={styles.bulkDivider} />
              
              <button className={`${styles.bulkBtn} ${styles.exportBtn}`} onClick={handleBulkExport}>
                <Download size={14} />
                <span>Export ZIP</span>
              </button>
              <button className={`${styles.bulkBtn} ${styles.deleteBtn}`} onClick={handleBulkDelete}>
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
              
              <button className={styles.bulkCloseBtn} onClick={() => setSelectedIds([])}>
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header section */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Project Directory</h1>
          <p className={styles.subtitle}>Manage, share, and review details of all scanned models and desktop configurations.</p>
        </div>
        
        <button className="btn-neon-orange" onClick={() => setIsCreateWizardOpen(true)}>
          <Plus size={18} />
          New Project
        </button>
      </div>

      {/* Filters & Controls Bar */}
      <div className={styles.filtersBar}>
        {/* Search */}
        <div className={`${styles.searchWrapper} glass-panel`}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search projects or base models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Sorting Dropdown */}
        <div className={`${styles.sortWrapper} glass-panel`}>
          <span className={styles.controlLabel}>Sort:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className={styles.selectInput}
          >
            <option value="date">Last Updated</option>
            <option value="name">Alphabetical (A-Z)</option>
            <option value="size">File Size</option>
          </select>
        </div>

        {/* Tab Filters */}
        <div className={`${styles.tabsWrapper} glass-panel`}>
          {(['All', 'Scanned', 'Designing', 'Completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`${styles.tabBtn} ${statusFilter === tab ? styles.activeTab : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Layout Toggle (Grid/List) */}
        <div className={`${styles.viewToggle} glass-panel`}>
          <button 
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grid')}
            aria-label="Grid View"
          >
            <Grid size={16} />
          </button>
          <button 
            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-label="List View"
          >
            <List size={16} />
          </button>
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
                  onClick={() => handleCardClick(proj)}
                >
                  <div className={`${styles.card} ${isSelected ? styles.cardSelected : ''} glass-panel`}>
                    {/* Image Container with overlay */}
                    <div className={styles.imgContainer}>
                      <img src={proj.imageUrl} alt={proj.name} className={styles.shoeImg} />
                      
                      {/* Checkbox overlay */}
                      <button 
                        className={`${styles.cardCheck} ${isSelected ? styles.cardCheckActive : ''}`}
                        onClick={(e) => handleSelectCard(e, proj.id)}
                      >
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      
                      {/* Visibility Badge */}
                      <div className={styles.overlayBadges}>
                        <span className={`${styles.badge} ${styles.visibilityBadge}`}>
                          {proj.visibility === 'Public' && <Globe size={12} />}
                          {proj.visibility === 'Link' && <Link size={12} />}
                          {proj.visibility === 'Private' && <EyeOff size={12} />}
                          {proj.visibility}
                        </span>
                      </div>
                      
                      {/* Options button */}
                      <button
                        className={`${styles.optionsBtn} glass-panel`}
                        onClick={(e) => {
                          e.stopPropagation(); // Avoid opening drawer
                          setActiveMenuId(activeMenuId === proj.id ? null : proj.id);
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === proj.id && (
                        <div className={`${styles.dropdown} glass-panel`} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setEditingProject(proj); setRenameValue(proj.name); setActiveMenuId(null); }}>
                            <Edit3 size={14} /> Rename
                          </button>
                          <button onClick={() => { setSharingProject(proj); setActiveMenuId(null); }}>
                            <Share2 size={14} /> Share Link
                          </button>
                          <div className={styles.dropdownDivider} />
                          <button className={styles.deleteBtn} onClick={() => handleDelete(proj.id)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Info Container */}
                    <div className={styles.cardInfo}>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.cardName}>{proj.name}</h3>
                        <span className={`${styles.statusIndicator} ${styles[proj.status.toLowerCase()]}`}>
                          {proj.status}
                        </span>
                      </div>
                      <div className={styles.metaRowCompact}>
                        <span className={styles.baseModel}>{proj.baseModel}</span>
                        <span className={styles.cardMetaDot}>•</span>
                        <span className={styles.fileSizeText}>{proj.fileSize}</span>
                      </div>

                      {/* Hover Details Panel */}
                      <div className={styles.hoverDetails}>
                        <div className={styles.hoverDetailRow}>
                          <span className={styles.hoverDetailLabel}>
                            {proj.device.toLowerCase().includes('iphone') || 
                             proj.device.toLowerCase().includes('ipad') || 
                             proj.device.toLowerCase().includes('samsung') || 
                             proj.device.toLowerCase().includes('phone') ? (
                              <Smartphone size={12} />
                            ) : (
                              <Laptop size={12} />
                            )}
                            Device
                          </span>
                          <span className={styles.hoverDetailVal}>{proj.device}</span>
                        </div>
                        
                        <div className={styles.hoverDetailRow}>
                          <span className={styles.hoverDetailLabel}>
                            <Camera size={12} />
                            Source Photos
                          </span>
                          <span className={styles.hoverDetailVal}>{proj.photosCount} photos</span>
                        </div>
                        
                        <div className={styles.hoverDetailRow}>
                          <span className={styles.hoverDetailLabel}>
                            <Cpu size={12} />
                            Vertices
                          </span>
                          <span className={styles.hoverDetailVal}>{proj.verticesCount}</span>
                        </div>

                        {proj.description && (
                          <p className={styles.hoverDescription}>{proj.description}</p>
                        )}
                      </div>
                      
                      <div className={styles.cardFooter}>
                        <span className={styles.updatedText}>Updated {proj.updatedAt}</span>
                        <button className={styles.viewDetailsLink} type="button">
                          <span>Inspect Drawer</span>
                          <ChevronRight size={12} />
                        </button>
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
        <div className={`${styles.tableContainer} glass-panel`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '45px' }}>
                  <button className={styles.tableHeadSelectBtn} onClick={handleSelectAll}>
                    {filteredAndSortedProjects.every(p => selectedIds.includes(p.id)) ? (
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
                <th>Status</th>
                <th>Visibility</th>
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
                            <span className={styles.rowProjectName}>{proj.name}</span>
                            <span className={styles.rowProjectUpdated}>Updated {proj.updatedAt}</span>
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
                      <td>
                        <span className={`${styles.statusIndicator} ${styles[proj.status.toLowerCase()]}`}>
                          {proj.status}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.visibilityBadge} ${styles.listVisibility}`}>
                          {proj.visibility === 'Public' && <Globe size={11} />}
                          {proj.visibility === 'Link' && <Link size={11} />}
                          {proj.visibility === 'Private' && <EyeOff size={11} />}
                          {proj.visibility}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={styles.rowActions}>
                          <button onClick={() => handleCardClick(proj)} title="Inspect project">
                            <ChevronRight size={16} />
                          </button>
                          <button onClick={() => { setSharingProject(proj); }} title="Share link">
                            <Share2 size={14} />
                          </button>
                          <button className={styles.rowDeleteBtn} onClick={() => handleDelete(proj.id)} title="Delete project">
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

      {/* Empty State */}
      {filteredAndSortedProjects.length === 0 && (
        <div className={`${styles.emptyState} glass-panel`}>
          <p>No projects found matching the filters.</p>
        </div>
      )}



      {/* Rename Modal */}
      {editingProject && (
        <div className={styles.modalBackdrop}>
          <motion.div 
            className={`${styles.modal} glass-panel`}
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
                <button type="button" className="btn-outline" onClick={() => setEditingProject(null)}>Cancel</button>
                <button type="submit" className="btn-neon-orange">Save changes</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Share Modal */}
      {sharingProject && (
        <div className={styles.modalBackdrop}>
          <motion.div 
            className={`${styles.modal} glass-panel`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <h3 className={styles.modalTitle}>Share Shoe Model</h3>
            <p className={styles.modalDesc}>Anyone with the link will be able to preview the 3D shoe structure online.</p>
            <div className={styles.linkCopyBox}>
              <input
                type="text"
                readOnly
                value={`https://sneakerflow.cloud/share/model-${sharingProject.id}`}
                className={styles.modalInput}
              />
              <button 
                className="btn-neon-orange"
                onClick={() => {
                  navigator.clipboard.writeText(`https://sneakerflow.cloud/share/model-${sharingProject.id}`);
                  alert('Link copied to clipboard!');
                  setSharingProject(null);
                }}
              >
                Copy
              </button>
            </div>
            <div className={styles.modalActions} style={{ marginTop: '24px' }}>
              <button className="btn-outline" onClick={() => setSharingProject(null)}>Close</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Multi-step Create Project Modal Step-Wizard */}
      {isCreateWizardOpen && (
        <div className={styles.modalBackdrop}>
          <motion.div 
            className={`${styles.wizardModal} glass-panel`}
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
                  <p className={styles.wizardStepDesc}>Choose a shoe scan synced from the mobile vault, or upload a custom GLB file.</p>
                  
                  {/* Select sources tab */}
                  <div className={styles.sourceSelectorTabs}>
                    <button 
                      className={`${styles.sourceTab} ${wizardSource === 'cloud' ? styles.sourceTabActive : ''}`}
                      onClick={() => setWizardSource('cloud')}
                    >
                      <Smartphone size={16} />
                      <span>Cloud Synced Scans</span>
                    </button>
                    <button 
                      className={`${styles.sourceTab} ${wizardSource === 'upload' ? styles.sourceTabActive : ''}`}
                      onClick={() => setWizardSource('upload')}
                    >
                      <Laptop size={16} />
                      <span>Upload custom .GLB</span>
                    </button>
                  </div>

                  {/* Sources Content */}
                  {wizardSource === 'cloud' ? (
                    <div className={styles.cloudScansList}>
                      {mockCloudScans.map((scan) => (
                        <div 
                          key={scan.id}
                          className={`${styles.cloudScanCard} ${selectedCloudScan === scan.id ? styles.cloudScanCardSelected : ''}`}
                          onClick={() => setSelectedCloudScan(scan.id)}
                        >
                          <div className={styles.cloudScanCheck}>
                            {selectedCloudScan === scan.id ? <CheckCircleIcon /> : <div className={styles.scanCheckCircle} />}
                          </div>
                          <div className={styles.cloudScanInfo}>
                            <span className={styles.scanName}>{scan.name}</span>
                            <div className={styles.scanMetaRow}>
                              <span>{scan.device}</span>
                              <span>•</span>
                              <span>{scan.photos} photos</span>
                              <span>•</span>
                              <span>{scan.size}</span>
                            </div>
                          </div>
                          <span className={styles.scanTime}>{scan.date}</span>
                        </div>
                      ))}
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
                        accept=".glb" 
                        style={{ display: 'none' }} 
                      />
                      <Laptop size={32} className={styles.uploadZoneIcon} />
                      {uploadedFile ? (
                        <div className={styles.uploadedFileDetails}>
                          <span className={styles.uploadedFileName}>{uploadedFile.name}</span>
                          <span className={styles.uploadedFileSize}>{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span className={styles.uploadZoneTipActive}>Click to change file</span>
                        </div>
                      ) : (
                        <div>
                          <span className={styles.uploadZoneTitle}>Drag & Drop or browse file</span>
                          <span className={styles.uploadZoneTip}>Supports 3D mesh GLB files. Max 50MB.</span>
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
                  <p className={styles.wizardStepDesc}>Give your sneaker project a title, set the base style, and privacy levels.</p>
                  
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

                    <div className={styles.wizardInputGroup}>
                      <label>Project Privacy Visibility</label>
                      <div className={styles.visibilityOptionsRow}>
                        {[
                          { value: 'Private', label: 'Private', desc: 'Only you can view' },
                          { value: 'Link', label: 'Link Share', desc: 'Anyone with URL' },
                          { value: 'Public', label: 'Public Showcase', desc: 'Show to community' }
                        ].map((opt) => (
                          <div 
                            key={opt.value}
                            className={`${styles.visOptionCard} ${wizardVisibility === opt.value ? styles.visOptionCardActive : ''}`}
                            onClick={() => setWizardVisibility(opt.value as any)}
                          >
                            <span className={styles.visOptionLabel}>{opt.label}</span>
                            <span className={styles.visOptionDesc}>{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Sync & Desktop launch */}
              {wizardStep === 3 && (
                <div className={styles.wizardStepContent}>
                  <h4 className={styles.wizardStepSubTitle}>Launch Design Studio</h4>
                  <p className={styles.wizardStepDesc}>
                    Sneaker Flow is preparing to bridge this asset model into KusStudio Desktop Client. Click below to begin customizer.
                  </p>
                  
                  <div className={styles.desktopConnectionWrapper}>
                    {/* Visual Interface mockup */}
                    <div className={styles.mockupConnectionBox}>
                      <div className={`${styles.mockNode} ${styles.mockNodeActive}`}>
                        <Smartphone size={20} />
                        <span>Cloud Scan</span>
                      </div>
                      
                      <div className={styles.mockLineConnection}>
                        <div className={styles.mockProgressLinePulse} />
                      </div>

                      <div className={`${styles.mockNode} ${wizardDesktopStatus === 'launched' ? styles.mockNodeActive : styles.mockNodeIdle}`}>
                        <Laptop size={20} />
                        <span>KusStudio</span>
                      </div>
                    </div>

                    {/* Status logs */}
                    <div className={styles.desktopConnectionLogs}>
                      <div className={styles.connLogItem}>
                        <Check size={14} className={styles.connCheck} />
                        <span>Asset buffers packaged successfully. ({wizardSource === 'cloud' ? 'Cloud Vault' : 'Local upload'})</span>
                      </div>
                      <div className={styles.connLogItem}>
                        {wizardDesktopStatus !== 'idle' ? (
                          <Check size={14} className={styles.connCheck} />
                        ) : (
                          <div className={styles.connLogCircleDot} />
                        )}
                        <span>Local daemon ping active (Port 8421).</span>
                      </div>
                      <div className={styles.connLogItem}>
                        {wizardDesktopStatus === 'launched' ? (
                          <Check size={14} className={styles.connCheck} />
                        ) : wizardDesktopStatus === 'packaging' ? (
                          <RefreshCw className={styles.spinIcon} size={14} />
                        ) : (
                          <div className={styles.connLogCircleDot} />
                        )}
                        <span>
                          {wizardDesktopStatus === 'launched' 
                            ? 'App launched! Design session locked.' 
                            : wizardDesktopStatus === 'packaging' 
                            ? 'Launching desktop executable...'
                            : 'Waiting to call desktop launcher deep link...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className={styles.wizardFooter}>
              {wizardStep > 1 ? (
                <button 
                  className="btn-outline" 
                  onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                  disabled={wizardDesktopStatus === 'packaging'}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              ) : (
                <button className="btn-outline" onClick={handleCloseWizard}>
                  Cancel
                </button>
              )}

              {wizardStep < 3 ? (
                <button className="btn-neon-orange" onClick={handleWizardNext}>
                  <span>Next Step</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button 
                  className="btn-neon-orange" 
                  onClick={handleCreateProjectFinal}
                  disabled={wizardDesktopStatus === 'packaging' || wizardDesktopStatus === 'launched'}
                  style={{ gap: '10px' }}
                >
                  {wizardDesktopStatus === 'packaging' ? (
                    <>
                      <RefreshCw className={styles.spinIcon} size={18} />
                      <span>Launching KusStudio...</span>
                    </>
                  ) : (
                    <>
                      <Laptop size={18} />
                      <span>Launch Desktop Client</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// Internal icon helpers
const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--color-orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
