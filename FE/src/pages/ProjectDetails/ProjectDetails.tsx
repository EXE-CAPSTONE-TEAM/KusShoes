import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Laptop, RefreshCw, Check, Download, FileText,
  Globe, Link, EyeOff, Terminal, Share2, UserPlus, X, ChevronDown
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Select } from '../../components/Select/Select';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { api, type PortalProject, type ProjectExport } from '../../api/client';
import styles from './ProjectDetails.module.css';

const ROLE_OPTIONS = [
  { value: 'View', label: 'View' },
  { value: 'Edit', label: 'Edit' },
];

interface ProjectDetailsProps {
  project: PortalProject;
  onBack: () => void;
  setProjects: React.Dispatch<React.SetStateAction<PortalProject[]>>;
}

// Avatar color palette for member initials
const AVATAR_COLORS = [
  '#FF5A36', '#6C63FF', '#34d399', '#F59E0B', '#E61E43',
  '#3B82F6', '#EC4899', '#14B8A6', '#A855F7', '#F97316'
];

function getAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface ShareMember {
  id: string;
  email: string;
  role: 'Edit' | 'View';
  joinedAt: string;
}

const INITIAL_MEMBERS: ShareMember[] = [];

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  onBack
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'share'>('overview');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Share tab state
  const [members, setMembers] = useState<ShareMember[]>(INITIAL_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Edit' | 'View'>('View');
  const [inviteError, setInviteError] = useState('');
  const [exports, setExports] = useState<ProjectExport[]>([]);

  const handleInvite = () => {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed) { setInviteError('Please enter an email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) { setInviteError('Please enter a valid email address.'); return; }
    if (members.some(m => m.email.toLowerCase() === trimmed)) { setInviteError('This person is already in the project.'); return; }
    setInviteError('Project sharing is not exposed by the backend yet.');
  };

  const handleChangeRole = (id: string, role: 'Edit' | 'View') => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
  };

  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  };

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

  useEffect(() => {
    api.listProjectExports(project.id)
      .then(setExports)
      .catch((caught) => toast(caught instanceof Error ? caught.message : 'Unable to load exports.', 'error'));
  }, [project.id, toast]);

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
              className={`${styles.tabBtn} ${activeTab === 'share' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('share')}
            >
              <Share2 size={14} />
              Share
              {members.length > 0 && (
                <span className={styles.tabCount}>{members.length}</span>
              )}
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

          {/* ========================= SHARE TAB ========================= */}
          {activeTab === 'share' && (
            <div className={styles.sharePanel}>

              {/* Invite Section */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>Invite People</h3>
                <p className={styles.shareDesc}>
                  Share this project with teammates. Choose their access level below.
                </p>
                <div className={styles.inviteForm}>
                  <div className={styles.inviteInputRow}>
                    <div className={styles.emailInputWrap}>
                      <UserPlus size={15} className={styles.emailInputIcon} />
                      <input
                        type="email"
                        className={styles.emailInput}
                        placeholder="Enter email address..."
                        value={inviteEmail}
                        onChange={e => { setInviteEmail(e.target.value); setInviteError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      />
                    </div>
                    <div className={styles.roleSelectWrap}>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as 'Edit' | 'View')}
                        options={ROLE_OPTIONS}
                        ariaLabel="Select invite role"
                      />
                    </div>
                    <button className={styles.inviteBtn} onClick={handleInvite}>
                      Invite
                    </button>
                  </div>
                  {inviteError && <p className={styles.inviteError}>{inviteError}</p>}
                </div>
              </div>

              {/* Members List */}
              <div className={styles.sectionBlock}>
                <h3 className={styles.sectionHeading}>
                  Project Members
                  <span className={styles.memberCountBadge}>{members.length}</span>
                </h3>

                {members.length === 0 ? (
                  <div className={styles.emptyMembers}>
                    <Share2 size={32} className={styles.emptyIcon} />
                    <p>No members yet. Invite someone above.</p>
                  </div>
                ) : (
                  <div className={styles.memberList}>
                    {members.map((member) => (
                      <div key={member.id} className={styles.memberRow}>
                        <div
                          className={styles.memberAvatar}
                          style={{ background: getAvatarColor(member.email) }}
                        >
                          {getInitials(member.email)}
                        </div>
                        <div className={styles.memberInfo}>
                          <span className={styles.memberEmail}>{member.email}</span>
                          <span className={styles.memberJoined}>Joined {member.joinedAt}</span>
                        </div>
                        <div className={styles.memberRoleWrap}>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                className={`${styles.roleBadge} ${member.role === 'Edit' ? styles.roleBadgeEdit : styles.roleBadgeView}`}
                              >
                                {member.role}
                                <ChevronDown size={11} />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content className={styles.roleDropdown} sideOffset={6} align="end">
                                {(['Edit', 'View'] as const).map(r => (
                                  <DropdownMenu.Item
                                    key={r}
                                    className={`${styles.roleOption} ${member.role === r ? styles.roleOptionActive : ''}`}
                                    onSelect={() => handleChangeRole(member.id, r)}
                                  >
                                    {r}
                                    {member.role === r && <Check size={12} />}
                                  </DropdownMenu.Item>
                                ))}
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                        <button
                          className={styles.removeBtn}
                          onClick={() => handleRemoveMember(member.id)}
                          title="Remove from project"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Visibility note */}
              <div className={styles.visibilityNote}>
                <div className={styles.visibilityNoteIcon}>
                  {project.visibility === 'Public'
                    ? <Globe size={14} />
                    : project.visibility === 'Link'
                    ? <Link size={14} />
                    : <EyeOff size={14} />}
                </div>
                <div>
                  <span className={styles.visNoteLabel}>Project is {project.visibility}</span>
                  <p className={styles.visNoteDesc}>
                    {project.visibility === 'Private' && 'Only invited members can access this project.'}
                    {project.visibility === 'Link' && 'Anyone with the link can view this project.'}
                    {project.visibility === 'Public' && 'This project is publicly visible to everyone.'}
                  </p>
                </div>
              </div>

            </div>
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
