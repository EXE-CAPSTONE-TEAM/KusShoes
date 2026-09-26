import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Laptop, RefreshCw, Check, Download, FileText,
  Globe, Link, EyeOff, Terminal, Share2, History, Lock, Droplets, Box
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject, type ProjectExport, type WatermarkPolicy } from '../../api/client';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { ArtisanSharePanel } from './ArtisanSharePanel';
import { ModelPanel } from './ModelPanel';
import styles from './ProjectDetails.module.css';

interface ProjectDetailsProps {
  project: PortalProject;
  onBack: () => void;
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
}

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  onBack,
  setProjects
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'model' | 'history' | 'share'>('overview');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const [exports, setExports] = useState<ProjectExport[]>([]);
  const [watermarkPolicy, setWatermarkPolicy] = useState<WatermarkPolicy | null>(null);
  const [canonicalModelAssetId, setCanonicalModelAssetId] = useState(project.canonicalModelAssetId);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'launched' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll console logs to bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // A project status describes backend processing, not a live desktop session.
  useEffect(() => {
    setSyncStatus('idle');
    setLogs([]);
    setLaunchError(null);
  }, [project.id]);

  // The list this page is usually opened from (api.listProjects) never carries
  // canonical_model_asset_id, so re-fetch the single-project detail to get it — both on
  // first entry and after an asset import/delete that may have changed it on the server.
  const refreshProject = useCallback(async () => {
    try {
      const updated = await api.getProject(project.id);
      setCanonicalModelAssetId(updated.canonicalModelAssetId);
      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to refresh the project.', 'error');
    }
  }, [project.id, setProjects, toast]);

  useEffect(() => {
    setCanonicalModelAssetId(project.canonicalModelAssetId);
    void refreshProject();
  }, [project.id, project.canonicalModelAssetId, refreshProject]);

  useEffect(() => {
    api.listProjectExports(project.id)
      .then(setExports)
      .catch((caught) => toast(caught instanceof Error ? caught.message : 'Unable to load exports.', 'error'));
  }, [project.id, toast]);

  // BR-65/67: informational only — Free-tier renders carry a watermark.
  useEffect(() => {
    api.getWatermarkPolicy(project.id).then(setWatermarkPolicy).catch(() => setWatermarkPolicy(null));
  }, [project.id]);

  const handleDownloadExport = async (item: ProjectExport) => {
    try {
      window.location.assign(await api.createExportDownloadUrl(item.id));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to create download URL.', 'error');
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return 'Size pending';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleLaunchKusStudio = async () => {
    if (syncStatus === 'connecting') return;
    setSyncStatus('connecting');
    setLaunchError(null);
    setLogs([`[${new Date().toLocaleTimeString()}] Requesting a secure one-time launch ticket...`]);

    try {
      const launch = await api.createEditorLaunch(project.id);
      setLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Ticket ready (${launch.expiresIn}s). Opening KusStudio...`,
      ]);
      window.location.assign(launch.desktopUrl);
      setSyncStatus('launched');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to open KusStudio.';
      setLaunchError(message);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Launch failed: ${message}`]);
      setSyncStatus('error');
      toast(message, 'error');
    }
  };

  const handleResetConnection = () => {
    setConfirmResetOpen(true);
  };

  const confirmResetConnection = () => {
    setSyncStatus('idle');
    setLogs([]);
    setLaunchError(null);
    toast('Local launch status reset. Project data was not changed.', 'info');
  };

  return (
    <div className={styles.container}>
      {/* Back Header Nav */}
      <div className={styles.navHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Directory</span>
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className={styles.detailsGrid}>
        
        {/* Left Column: Image Preview + HUD Frame */}
        <div className={styles.previewColumn}>
          <div 
            className={styles.imageFrame}
            style={{ '--neon-glow': project.colorCode } as React.CSSProperties}
          >
            <img src={project.imageUrl} alt={project.name} className={styles.shoeImg} />
            
            {/* Visual HUD overlay */}
            <div className={styles.hudOverlay}>
              <div className={styles.hudHeader}>
                <span className={styles.hudPulseDot} />
                <span className={styles.hudTextMono}>SCAN_ACQUISITION_ONLINE</span>
              </div>
              
              <div className={styles.hudFooter}>
                <div className={styles.hudRow}>
                  <span>GRID_DIM:</span>
                  <span>325.2 x 124.5 x 202.1 mm</span>
                </div>
                <div className={styles.hudRow}>
                  <span>VERT_DENSITY:</span>
                  <span>{project.verticesCount}</span>
                </div>
                <div className={styles.hudRow}>
                  <span>HARDWARE:</span>
                  <span>{project.device}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Tab Navigation + Content */}
        <div className={styles.infoColumn}>

          {/* Project Title Block */}
          <div className={styles.projectHeader}>
            <div className={styles.titleRow}>
              <h1 className={styles.projectTitle}>{project.name}</h1>
              <span className={`${styles.statusBadge} ${styles[project.status.toLowerCase()]}`}>
                {project.status}
              </span>
              {project.isLocked && (
                <span className={styles.statusBadge} title="Read-only after a plan downgrade. Upgrade to edit it again.">
                  <Lock size={12} /> Read-only
                </span>
              )}
              {watermarkPolicy?.required && (
                <span className={styles.statusBadge} title="Free-tier renders carry a watermark. Upgrade to export clean.">
                  <Droplets size={12} /> Watermarked
                </span>
              )}
            </div>
            <p className={styles.projectSubtitle}>
              Base Model: <strong>{project.baseModel}</strong>
            </p>
          </div>

          {/* ========================= TAB NAVIGATION ========================= */}
          <div className={styles.tabNav}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <FileText size={14} />
              Overview
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'model' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('model')}
            >
              <Box size={14} />
              Model 3D
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={14} />
              History &amp; Templates
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'share' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('share')}
            >
              <Share2 size={14} />
              Share with artisan
            </button>
          </div>

          {/* ========================= OVERVIEW TAB ========================= */}
          {activeTab === 'overview' && (
            <>
              {/* Description */}
              <div className={styles.descSection}>
                <p className={styles.descriptionText}>
                  {project.description || 'No description provided for this sneaker reconstruction scan. Open in KusStudio Desktop to write annotations and build textures.'}
                </p>
              </div>

              {/* Technical Specs */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>Reconstruction Metadata</h3>
                <div className={styles.metadataGrid}>
                  <div className={styles.metaRow}>
                    <span>Reconstruction Density</span>
                    <span>{project.verticesCount}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>Updated timestamp</span>
                    <span>{project.updatedAt}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>Visibility Level</span>
                    <span className={styles.visibilityValue}>
                      {project.visibility === 'Public' && <Globe size={13} />}
                      {project.visibility === 'Link' && <Link size={13} />}
                      {project.visibility === 'Private' && <EyeOff size={13} />}
                      {project.visibility}
                    </span>
                  </div>
                </div>
              </div>

              {/* Download Formats */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>Mesh Download Formats</h3>
                <div className={styles.downloadsGrid}>
                  {exports.length === 0 && <span>No completed exports are available.</span>}
                  {exports.map((item) => (
                    <button
                      key={item.id}
                      className={styles.downloadCard}
                      onClick={() => handleDownloadExport(item)}
                    >
                      <div className={styles.dlHeader}>
                        <FileText size={16} className={styles.dlIcon} />
                        <span className={styles.dlFormat}>.{item.format.toUpperCase()}</span>
                      </div>
                      <div className={styles.dlBody}>
                        <span className={styles.dlType}>Generated export</span>
                        <span className={styles.dlSize}>{formatBytes(item.file_size_bytes)}</span>
                      </div>
                      <Download size={14} className={styles.dlArrow} />
                    </button>
                  ))}
                </div>
              </div>

              {/* KusStudio Integration Panel */}
              <div className={`${styles.kusStudioPanel} glass-panel`}>
                <div className={styles.panelHeader}>
                  <Laptop size={18} className={styles.panelIcon} />
                  <div>
                    <h4 className={styles.panelTitle}>KusStudio Desktop Client</h4>
                    <p className={styles.panelDesc}>Open this project in KusStudio using a short-lived, one-time secure handoff.</p>
                  </div>
                </div>

                {(logs.length > 0 || syncStatus === 'connecting' || syncStatus === 'error') && (
                  <div className={styles.terminalBox}>
                    <div className={styles.terminalHeader}>
                      <Terminal size={12} className={styles.termIcon} />
                      <span className={styles.termTitle}>kusstudio_daemon.log</span>
                      <div className={styles.termControls}>
                        <span className={styles.termDot} />
                        <span className={styles.termDot} />
                        <span className={styles.termDot} />
                      </div>
                    </div>
                    <div className={styles.terminalConsole}>
                      {logs.map((log, index) => (
                        <div key={index} className={styles.consoleLogLine}>{log}</div>
                      ))}
                      {syncStatus === 'connecting' && (
                        <div className={styles.consoleLogLinePulse}>
                          <span className={styles.pulseCursor}>_</span>
                        </div>
                      )}
                      <div ref={consoleEndRef} />
                    </div>
                  </div>
                )}

                <div className={styles.panelFooter}>
                  {(syncStatus === 'idle' || syncStatus === 'error') && (
                    <button
                      className="btn-neon-orange"
                      onClick={handleLaunchKusStudio}
                      style={{ width: '100%', justifyContent: 'center' }}
                      aria-describedby={launchError ? 'kusstudio-launch-error' : undefined}
                    >
                      <Laptop size={16} />
                      <span>{syncStatus === 'error' ? 'Retry secure launch' : 'Open in KusStudio Desktop'}</span>
                    </button>
                  )}
                  {launchError && (
                    <span id="kusstudio-launch-error" role="alert" className={styles.inviteError}>
                      {launchError}
                    </span>
                  )}
                  {syncStatus === 'connecting' && (
                    <div className={styles.syncConnectingLoader} role="status" aria-live="polite">
                      <RefreshCw className={styles.spinIcon} size={16} />
                      <span>Preparing a secure desktop session...</span>
                    </div>
                  )}
                  {syncStatus === 'launched' && (
                    <div className={styles.syncLaunchedGroup}>
                      <div className={styles.syncConnectedBanner} role="status" aria-live="polite">
                        <Check size={16} className={styles.checkIcon} />
                        <span>Launch request sent. KusStudio will complete secure sign-in.</span>
                      </div>
                      <button className={styles.disconnectBtn} onClick={handleResetConnection}>
                        Reset launch status
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ========================= MODEL 3D TAB ========================= */}
          {activeTab === 'model' && (
            <ModelPanel
              projectId={project.id}
              canonicalModelAssetId={canonicalModelAssetId}
              locked={project.isLocked}
              onModelChange={refreshProject}
            />
          )}

          {/* ========================= HISTORY TAB ========================= */}
          {activeTab === 'history' && (
            <VersionHistoryPanel projectId={project.id} locked={project.isLocked} />
          )}

          {/* ========================= SHARE TAB ========================= */}
          {activeTab === 'share' && (
            <ArtisanSharePanel projectId={project.id} onUpgrade={() => window.location.assign('/billing')} />
          )}

        </div>

      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="Reset local launch status?"
        description="This only resets the portal message. It does not close KusStudio or change project data."
        confirmLabel="Reset Status"
        onConfirm={confirmResetConnection}
      />
    </div>
  );
};
