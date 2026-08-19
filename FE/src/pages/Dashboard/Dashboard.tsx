import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Progress from '@radix-ui/react-progress';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Avatar from '@radix-ui/react-avatar';
import * as Separator from '@radix-ui/react-separator';
import { FolderKanban, HardDrive, ShieldCheck, Download, RefreshCw, Plus, ArrowRight, X, MoreVertical, Trash2, Eye, Pin } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, type PortalProject, type Usage, type UserProfile } from '../../api/client';
import styles from './Dashboard.module.css';

// 3D Sneaker Model built using standard Three.js primitives
const SneakerModel: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  // Auto rotate the sneaker
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.2, 0]} rotation={[0.1, -0.5, 0.15]}>
      {/* Sole (Sole of the shoe) */}
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[3.2, 0.25, 1.3]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0.1} />
      </mesh>
      
      {/* Midsole Layer */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[3.22, 0.15, 1.32]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Main Body (Upper part) */}
      <mesh position={[-0.2, 0.2, 0]}>
        <boxGeometry args={[2.0, 0.8, 1.25]} />
        <meshStandardMaterial color="#FF5A36" roughness={0.4} metalness={0.2} />
      </mesh>

      {/* Front Toe Box */}
      <mesh position={[0.9, 0.05, 0]}>
        <boxGeometry args={[0.8, 0.5, 1.2]} />
        <meshStandardMaterial color="#e61e43" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Heel Collar (Ankle support) */}
      <mesh position={[-0.8, 0.6, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.8, 1.0, 1.2]} />
        <meshStandardMaterial color="#0b0b0c" roughness={0.8} />
      </mesh>

      {/* Accent Neon Stripe (Sunset Orange glow) */}
      <mesh position={[0, 0.15, 0.63]}>
        <boxGeometry args={[1.5, 0.1, 0.03]} />
        <meshStandardMaterial 
          color="#FF5A36" 
          emissive="#FF5A36" 
          emissiveIntensity={1.5} 
        />
      </mesh>
      
      {/* Accent Neon Stripe 2 (Crimson glow) */}
      <mesh position={[0, 0.0, 0.63]}>
        <boxGeometry args={[1.2, 0.08, 0.03]} />
        <meshStandardMaterial 
          color="#e61e43" 
          emissive="#e61e43" 
          emissiveIntensity={1.2} 
        />
      </mesh>

      {/* Lacing System Base */}
      <mesh position={[0.3, 0.5, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.8, 0.1, 0.8]} />
        <meshStandardMaterial color="#121215" roughness={0.9} />
      </mesh>
    </group>
  );
};

interface DashboardProps {
  setActivePage: (page: string) => void;
  projects: PortalProject[];
}

export const Dashboard: React.FC<DashboardProps> = ({ setActivePage, projects }) => {
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [syncLogs, setSyncLogs] = useState(() => projects.slice(0, 5).map((project) => ({
    id: project.id,
    text: `${project.name} · ${project.rawStatus}`,
    time: new Date(project.updatedAt).toLocaleString(),
  })));

  useEffect(() => {
    Promise.all([api.profile(), api.usage()])
      .then(([nextProfile, nextUsage]) => {
        setProfile(nextProfile);
        setUsage(nextUsage);
      })
      .catch(() => {
        // The global request client handles token refresh; page-level fallbacks remain visible.
      });
  }, []);

  useEffect(() => {
    setSyncLogs(projects.slice(0, 5).map((project) => ({
      id: project.id,
      text: `${project.name} · ${project.rawStatus}`,
      time: new Date(project.updatedAt).toLocaleString(),
    })));
  }, [projects]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const page = await api.listProjects();
      setSyncLogs(page.items.slice(0, 5).map((project) => ({
        id: project.id,
        text: `${project.name} · ${project.rawStatus}`,
        time: new Date(project.updatedAt).toLocaleString(),
      })));
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveLog = (id: string) => {
    setSyncLogs(prev => prev.filter(log => log.id !== id));
  };

  const maxProjects = usage?.max_projects;
  const maxExports = usage?.max_exports_per_month;
  const projectProgress = maxProjects ? Math.min(100, (usage?.projects_count ?? projects.length) / maxProjects * 100) : 0;
  const statCards = [
    {
      label: 'Total Projects',
      value: maxProjects ? `${usage?.projects_count ?? projects.length} / ${maxProjects}` : `${projects.length} Active`,
      icon: FolderKanban,
      link: 'projects',
      progress: maxProjects ? projectProgress : undefined,
    },
    {
      label: 'Monthly Exports',
      value: maxExports ? `${usage?.exports_count ?? 0} / ${maxExports}` : `${usage?.exports_count ?? 0} used`,
      icon: HardDrive,
      link: 'billing',
    },
    { label: 'Subscription Plan', value: usage?.tier ?? 'Free', icon: ShieldCheck, link: 'billing' },
  ];

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username
    : 'Creator';
  const avatarUrl = profile ? api.avatarUrl(profile.avatar_path) : undefined;

  return (
    <Tooltip.Provider delayDuration={200}>
    <div className={styles.container}>
      {/* Welcome Banner */}
      <motion.div
        className={`${styles.banner} glass-panel`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className={styles.bannerInfo}>
          <div className={styles.bannerIdentity}>
            <Avatar.Root className={styles.avatarRoot}>
              <Avatar.Image
                className={styles.avatarImage}
                src={avatarUrl}
                alt={displayName}
              />
              <Avatar.Fallback className={styles.avatarFallback} delayMs={300}>
                {displayName.slice(0, 2).toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
            <span className={styles.badge}>SNEAKER FLOW 3D</span>
          </div>
          <h1 className={styles.bannerTitle}>Keep Creating, <span className="text-gradient-orange">{displayName}</span></h1>
          <p className={styles.bannerDesc}>
            Manage your mobile scans, billing, and system configurations. Sync shoe assets instantly to the Desktop App for full 3D rendering.
          </p>
          <div className={styles.bannerActions}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button className="btn-neon-orange" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`${styles.icon} ${syncing ? styles.spin : ''}`} size={18} />
                  {syncing ? 'Syncing assets...' : 'Sync Cloud Scan'}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className={styles.tooltipContent} sideOffset={8}>
                  Pulls the latest scans from your mobile device
                  <Tooltip.Arrow className={styles.tooltipArrow} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button className="btn-outline">
                  <Download size={18} />
                  Get Desktop App
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className={styles.dialogOverlay} />
                <Dialog.Content className={styles.dialogContent}>
                  <Dialog.Title className={styles.dialogTitle}>KusShoes Desktop v1.4.2</Dialog.Title>
                  <Dialog.Description className={styles.dialogDescription}>
                    Get full 3D rendering, paint mapping, and offline project sync by installing the Desktop companion app.
                  </Dialog.Description>
                  <div className={styles.dialogActions}>
                    <Dialog.Close asChild>
                      <button className="btn-outline">Cancel</button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <button className="btn-neon-orange">Start Download</button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Close asChild>
                    <button className={styles.dialogCloseIcon} aria-label="Close">
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
        
        {/* Dynamic 3D Sneaker Showcase */}
        <div className={styles.canvasContainer}>
          <div className={styles.canvasWrapper}>
            <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
              <ambientLight intensity={0.4} />
              <pointLight position={[10, 10, 10]} intensity={1.5} />
              <pointLight position={[-10, -10, -10]} intensity={0.5} />
              <spotLight position={[0, 5, 2]} angle={0.3} penumbra={1} intensity={2} color="#FF5A36" />
              <spotLight position={[-2, -5, -2]} angle={0.3} penumbra={1} intensity={1} color="#e61e43" />
              <Stage intensity={0.5} environment="city" adjustCamera={false}>
                <SneakerModel />
              </Stage>
              <OrbitControls enableZoom={false} autoRotate={false} />
            </Canvas>
          </div>
          <span className={styles.canvasTip}>Drag to spin 3D Sneaker</span>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className={`${styles.statCard} glass-panel`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * (index + 1) }}
              onClick={() => setActivePage(stat.link)}
            >
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>{stat.label}</span>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className={styles.statIconWrapper}>
                      <Icon size={20} className={styles.statIcon} />
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className={styles.tooltipContent} sideOffset={6}>
                      {stat.label}
                      <Tooltip.Arrow className={styles.tooltipArrow} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
              <div className={styles.statValue}>{stat.value}</div>
              {stat.progress !== undefined && (
                <Progress.Root className={styles.progressRoot} value={stat.progress}>
                  <Progress.Indicator
                    className={styles.progressIndicator}
                    style={{ transform: `translateX(-${100 - stat.progress}%)` }}
                  />
                </Progress.Root>
              )}
              <div className={styles.statFooter}>
                <span>View details</span>
                <ArrowRight size={14} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Grid */}
      <div className={styles.bottomGrid}>
        {/* Recent sync logs */}
        <motion.div
          className={`${styles.logPanel} glass-panel`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Cloud Synced Scans</h2>
            <button className={styles.panelActionBtn} onClick={handleSync}>
              Sync Now
            </button>
          </div>
          <Separator.Root className={styles.separator} decorative />
          <div className={styles.logList}>
            {syncLogs.map(log => (
              <div key={log.id} className={styles.logItem}>
                <div className={styles.logIndicator} />
                <div className={styles.logBody}>
                  <p className={styles.logText}>{log.text}</p>
                  <span className={styles.logTime}>{log.time}</span>
                </div>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className={styles.logMenuBtn} aria-label="Log actions">
                      <MoreVertical size={16} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className={styles.dropdownContent} sideOffset={6} align="end">
                      <DropdownMenu.Item className={styles.dropdownItem} onSelect={() => setActivePage('projects')}>
                        <Eye size={14} /> View project
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={styles.dropdownItem}>
                        <Pin size={14} /> Pin to top
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className={styles.dropdownSeparator} />
                      <DropdownMenu.Item
                        className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                        onSelect={() => handleRemoveLog(log.id)}
                      >
                        <Trash2 size={14} /> Remove
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick action card */}
        <motion.div 
          className={`${styles.actionPanel} glass-panel`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className={styles.actionContent}>
            <h3 className={styles.actionTitle}>Create New Sneaker</h3>
            <p className={styles.actionDesc}>Create an empty workspace project and begin designing from scratch.</p>
            <button className="btn-neon-orange" onClick={() => setActivePage('projects')}>
              <Plus size={18} />
              Create Project
            </button>
          </div>
          <div className={styles.gridOverlayBackground} />
        </motion.div>
      </div>
    </div>
    </Tooltip.Provider>
  );
};
