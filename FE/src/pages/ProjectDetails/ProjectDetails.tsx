import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Laptop, RefreshCw, Check, Download, FileText,
  Terminal, Share2, History, Lock, Droplets, Box
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject, type ProjectExport, type WatermarkPolicy } from '../../api/client';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { ArtisanSharePanel } from './ArtisanSharePanel';
import { ModelPanel } from './ModelPanel';
import styles from './ProjectDetails.module.css';
import { DESKTOP_INSTALLER_URL } from '../../utils/desktopRelease';

/** If the browser never hands focus to KusStudio within this window, it is probably not installed. */
const DESKTOP_HANDOFF_MS = 3000;

interface ProjectDetailsProps {
  project: PortalProject;
  onBack: () => void;
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
}

type DetailTab = 'overview' | 'model' | 'history' | 'share';
const DETAIL_TABS: readonly DetailTab[] = ['overview', 'model', 'history', 'share'];

/** `?tab=share` lets other screens (e.g. the project card's Share action) deep-link a tab. */
function tabFromSearch(search: string): DetailTab {
  const tab = new URLSearchParams(search).get('tab');
  return DETAIL_TABS.find((candidate) => candidate === tab) ?? 'overview';
}

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  onBack,
  setProjects
}) => {
  const { t } = useTranslation('details');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<DetailTab>(() => tabFromSearch(window.location.search));
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const [exports, setExports] = useState<ProjectExport[]>([]);
  const [watermarkPolicy, setWatermarkPolicy] = useState<WatermarkPolicy | null>(null);
  const [canonicalModelAssetId, setCanonicalModelAssetId] = useState(project.canonicalModelAssetId);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'launched' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [desktopMaybeMissing, setDesktopMaybeMissing] = useState(false);
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
    setActiveTab(tabFromSearch(window.location.search));
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
      toast(caught instanceof Error ? caught.message : t('page.refreshError'), 'error');
    }
  }, [project.id, setProjects, toast, t]);

  useEffect(() => {
    setCanonicalModelAssetId(project.canonicalModelAssetId);
    void refreshProject();
  }, [project.id, project.canonicalModelAssetId, refreshProject]);

  useEffect(() => {
    api.listProjectExports(project.id)
      .then(setExports)
      .catch((caught) => toast(caught instanceof Error ? caught.message : t('page.exportsError'), 'error'));
  }, [project.id, toast, t]);

  // BR-65/67: informational only — Free-tier renders carry a watermark.
  useEffect(() => {
    api.getWatermarkPolicy(project.id).then(setWatermarkPolicy).catch(() => setWatermarkPolicy(null));
  }, [project.id]);

  const handleDownloadExport = async (item: ProjectExport) => {
    try {
      window.location.assign(await api.createExportDownloadUrl(item.id));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('page.downloadError'), 'error');
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return t('page.sizePending');
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleLaunchKusStudio = async () => {
    if (syncStatus === 'connecting') return;
    setSyncStatus('connecting');
    setLaunchError(null);
    setLogs([t('page.logRequesting', { time: new Date().toLocaleTimeString() })]);

    try {
      const launch = await api.createEditorLaunch(project.id);
      setLogs(prev => [
        ...prev,
        t('page.logTicket', { time: new Date().toLocaleTimeString(), seconds: launch.expiresIn }),
      ]);
      setDesktopMaybeMissing(false);
      let handedOff = false;
      const onBlur = () => {
        handedOff = true;
      };
      window.addEventListener('blur', onBlur, { once: true });
      window.setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        if (!handedOff && document.visibilityState === 'visible') {
          setDesktopMaybeMissing(true);
        }
      }, DESKTOP_HANDOFF_MS);
      window.location.assign(launch.desktopUrl);
      setSyncStatus('launched');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('page.launchError');
      setLaunchError(message);
      setLogs(prev => [...prev, t('page.logFailed', { time: new Date().toLocaleTimeString(), message })]);
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
    setDesktopMaybeMissing(false);
    toast(t('page.resetToast'), 'info');
  };

  return (
    <div className={styles.container}>
      {/* Back Header Nav */}
      <div className={styles.navHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t('page.back')}</span>
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
                <span className={styles.hudTextMono}>{t('page.hudOnline')}</span>
              </div>
              
              <div className={styles.hudFooter}>
                <div className={styles.hudRow}>
                  <span>{t('page.hudDim')}</span>
                  <span>325.2 x 124.5 x 202.1 mm</span>
                </div>
                <div className={styles.hudRow}>
                  <span>{t('page.hudDensity')}</span>
                  <span>{project.verticesCount}</span>
                </div>
                <div className={styles.hudRow}>
                  <span>{t('page.hudHardware')}</span>
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
                <span className={styles.statusBadge} title={t('page.readOnlyTitle')}>
                  <Lock size={12} /> {t('page.readOnly')}
                </span>
              )}
              {watermarkPolicy?.required && (
                <span className={styles.statusBadge} title={t('page.watermarkedTitle')}>
                  <Droplets size={12} /> {t('page.watermarked')}
                </span>
              )}
            </div>
            <p className={styles.projectSubtitle}>
              {t('page.baseModel')} <strong>{project.baseModel}</strong>
            </p>
          </div>

          {/* ========================= TAB NAVIGATION ========================= */}
          <div className={styles.tabNav}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <FileText size={14} />
              {t('page.tabOverview')}
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'model' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('model')}
            >
              <Box size={14} />
              {t('page.tabModel')}
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={14} />
              {t('page.tabHistory')}
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'share' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('share')}
            >
              <Share2 size={14} />
              {t('page.tabShare')}
            </button>
          </div>

          {/* ========================= OVERVIEW TAB ========================= */}
          {activeTab === 'overview' && (
            <>
              {/* Description */}
              <div className={styles.descSection}>
                <p className={styles.descriptionText}>
                  {project.description || t('page.noDescription')}
                </p>
              </div>

              {/* Technical Specs */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>{t('page.metaHeading')}</h3>
                <div className={styles.metadataGrid}>
                  <div className={styles.metaRow}>
                    <span>{t('page.metaDensity')}</span>
                    <span>{project.verticesCount}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>{t('page.metaUpdated')}</span>
                    <span>{project.updatedAt}</span>
                  </div>
                </div>
              </div>

              {/* Download Formats */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>{t('page.formatsHeading')}</h3>
                <div className={styles.downloadsGrid}>
                  {exports.length === 0 && <span>{t('page.noExports')}</span>}
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
                        <span className={styles.dlType}>{t('page.generatedExport')}</span>
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
                    <h4 className={styles.panelTitle}>{t('page.studioTitle')}</h4>
                    <p className={styles.panelDesc}>{t('page.studioDesc')}</p>
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
                      <span>{syncStatus === 'error' ? t('page.retryLaunch') : t('page.openDesktop')}</span>
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
                      <span>{t('page.preparing')}</span>
                    </div>
                  )}
                  {syncStatus === 'launched' && (
                    <div className={styles.syncLaunchedGroup}>
                      <div className={styles.syncConnectedBanner} role="status" aria-live="polite">
                        <Check size={16} className={styles.checkIcon} />
                        <span>{t('page.launched')}</span>
                      </div>
                      {desktopMaybeMissing && (
                        <p className={styles.desktopInstallHint} role="status">
                          {t('page.notOpened')}{' '}
                          <a href={DESKTOP_INSTALLER_URL} download>
                            {t('page.downloadEditor')}
                          </a>
                          {t('page.afterInstall')}
                        </p>
                      )}
                      <button className={styles.disconnectBtn} onClick={handleResetConnection}>
                        {t('page.resetStatus')}
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
        title={t('page.confirmTitle')}
        description={t('page.confirmDesc')}
        confirmLabel={t('page.confirmLabel')}
        onConfirm={confirmResetConnection}
      />
    </div>
  );
};
