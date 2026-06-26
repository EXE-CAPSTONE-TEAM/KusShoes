import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Laptop, RefreshCw, Check, Download, FileText, 
  Globe, Link, EyeOff, Terminal, Share2, UserPlus, X, ChevronDown
} from 'lucide-react';
import styles from './ProjectDetails.module.css';

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

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
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

const INITIAL_MEMBERS: ShareMember[] = [
  { id: '1', email: 'alex.nguyen@studio.io', role: 'Edit', joinedAt: '2 days ago' },
  { id: '2', email: 'mia.tran@designlab.co', role: 'View', joinedAt: '5 days ago' },
];

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  onBack,
  setProjects
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'share'>('overview');

  // Share tab state
  const [members, setMembers] = useState<ShareMember[]>(INITIAL_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Edit' | 'View'>('View');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [openRoleDropdown, setOpenRoleDropdown] = useState<string | null>(null);

  const handleInvite = () => {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed) { setInviteError('Please enter an email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) { setInviteError('Please enter a valid email address.'); return; }
    if (members.some(m => m.email.toLowerCase() === trimmed)) { setInviteError('This person is already in the project.'); return; }
    const newMember: ShareMember = {
      id: Date.now().toString(),
      email: trimmed,
      role: inviteRole,
      joinedAt: 'Just now',
    };
    setMembers(prev => [newMember, ...prev]);
    setInviteEmail('');
    setInviteError('');
    setInviteSuccess(`Invite sent to ${trimmed}`);
    setTimeout(() => setInviteSuccess(''), 3000);
  };

  const handleChangeRole = (id: string, role: 'Edit' | 'View') => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    setOpenRoleDropdown(null);
  };

  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'launched'>(() => {
    return project.status === 'Designing' ? 'launched' : 'idle';
  });
  const [logs, setLogs] = useState<string[]>(() => {
    if (project.status === 'Designing') {
      const time = new Date().toLocaleTimeString();
      return [`[${time}] Ready. Session locked on local KusStudio client.`];
    }
    return [];
  });
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll console logs to bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Sync state if project changes
  useEffect(() => {
    setSyncStatus(project.status === 'Designing' ? 'launched' : 'idle');
    setLogs(project.status === 'Designing' ? [
      `[${new Date().toLocaleTimeString()}] Ready. Session locked on local KusStudio client.`
    ] : []);
  }, [project]);

  const handleLaunchKusStudio = () => {
    if (syncStatus === 'connecting') return;
    setSyncStatus('connecting');
    setLogs([]);

    const logSteps = [
      'Pinging KusStudio daemon on port 8421...',
      'Connection established with localhost:8421 (WS protocol).',
      'Handshaking secure local daemon socket token...',
      `Verifying workspace file structures for "${project.name}"...`,
      `Packaging reconstruction vertex buffers (${project.fileSize})...`,
      `Streaming photogrammetry assets (${project.photosCount} files)...`,
      'Buffers synchronized. Temporary read/write lock acquired.',
      'Launching KusStudio Desktop application...',
      'Desktop window active. Sneaker Flow Portal lock engaged.'
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < logSteps.length) {
        const timeStr = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timeStr}] ${logSteps[stepIndex]}`]);
        stepIndex++;
      } else {
        clearInterval(interval);
        setSyncStatus('launched');
        // Update parent projects list state
        setProjects(prev => 
          prev.map(p => p.id === project.id ? { ...p, status: 'Designing', updatedAt: 'Just now' } : p)
        );
      }
    }, 600);
  };

  const handleResetConnection = () => {
    if (confirm('Are you sure you want to release the desktop workspace lock? This will set status back to Scanned.')) {
      setSyncStatus('idle');
      setLogs([]);
      setProjects(prev => 
        prev.map(p => p.id === project.id ? { ...p, status: 'Scanned', updatedAt: 'Just now' } : p)
      );
    }
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
                  {[
                    { format: '.gltf', type: 'Web & Mobile 3D', size: '12.4 MB' },
                    { format: '.obj', type: 'Print ready mesh', size: '38.1 MB' },
                    { format: '.fbx', type: 'Unity/Unreal Rig', size: '22.8 MB' },
                    { format: '.usdz', type: 'iOS AR QuickLook', size: '8.5 MB' },
                  ].map((dl) => (
                    <button
                      key={dl.format}
                      className={styles.downloadCard}
                      onClick={() => alert(`Downloading "${project.name}${dl.format}" (${dl.size})...`)}
                    >
                      <div className={styles.dlHeader}>
                        <FileText size={16} className={styles.dlIcon} />
                        <span className={styles.dlFormat}>{dl.format.toUpperCase()}</span>
                      </div>
                      <div className={styles.dlBody}>
                        <span className={styles.dlType}>{dl.type}</span>
                        <span className={styles.dlSize}>{dl.size}</span>
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
                    <p className={styles.panelDesc}>Sync raw photogrammetry point clouds and paint custom sneakers on your local PC.</p>
                  </div>
                </div>

                {(logs.length > 0 || syncStatus === 'connecting') && (
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
                  {syncStatus === 'idle' && (
                    <button className="btn-neon-orange" onClick={handleLaunchKusStudio} style={{ width: '100%', justifyContent: 'center' }}>
                      <Laptop size={16} />
                      <span>Open in KusStudio Desktop</span>
                    </button>
                  )}
                  {syncStatus === 'connecting' && (
                    <div className={styles.syncConnectingLoader}>
                      <RefreshCw className={styles.spinIcon} size={16} />
                      <span>Streaming buffers to Port 8421...</span>
                    </div>
                  )}
                  {syncStatus === 'launched' && (
                    <div className={styles.syncLaunchedGroup}>
                      <div className={styles.syncConnectedBanner}>
                        <Check size={16} className={styles.checkIcon} />
                        <span>Active Session Locked on Desktop Client</span>
                      </div>
                      <button className={styles.disconnectBtn} onClick={handleResetConnection}>
                        Release Lock
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
                      <select
                        className={styles.roleSelect}
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as 'Edit' | 'View')}
                      >
                        <option value="View">View</option>
                        <option value="Edit">Edit</option>
                      </select>
                      <ChevronDown size={13} className={styles.selectChevron} />
                    </div>
                    <button className={styles.inviteBtn} onClick={handleInvite}>
                      Invite
                    </button>
                  </div>
                  {inviteError && <p className={styles.inviteError}>{inviteError}</p>}
                  {inviteSuccess && <p className={styles.inviteSuccess}>{inviteSuccess}</p>}
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
                          <button
                            className={`${styles.roleBadge} ${member.role === 'Edit' ? styles.roleBadgeEdit : styles.roleBadgeView}`}
                            onClick={() => setOpenRoleDropdown(openRoleDropdown === member.id ? null : member.id)}
                          >
                            {member.role}
                            <ChevronDown size={11} />
                          </button>
                          {openRoleDropdown === member.id && (
                            <div className={styles.roleDropdown}>
                              {(['Edit', 'View'] as const).map(r => (
                                <button
                                  key={r}
                                  className={`${styles.roleOption} ${member.role === r ? styles.roleOptionActive : ''}`}
                                  onClick={() => handleChangeRole(member.id, r)}
                                >
                                  {r}
                                  {member.role === r && <Check size={12} />}
                                </button>
                              ))}
                            </div>
                          )}
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
    </div>
  );
};
