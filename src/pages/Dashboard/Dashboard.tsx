import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { FolderKanban, HardDrive, ShieldCheck, Download, RefreshCw, Plus, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
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

export const Dashboard: React.FC<{ setActivePage: (page: string) => void }> = ({ setActivePage }) => {
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([
    { id: 1, text: 'Air Force 1 Custom - Synced from Desktop App', time: '2 hours ago' },
    { id: 2, text: 'Jordan Retro scanned from iPhone 14 Pro', time: 'Yesterday' },
    { id: 3, text: 'Adidas Superstar - Project created', time: '3 days ago' },
  ]);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setSyncLogs(prev => [
        { id: Date.now(), text: 'New Mobile Scan synced - Nike Dunk Low', time: 'Just now' },
        ...prev
      ]);
    }, 2000);
  };

  const statCards = [
    { label: 'Total Projects', value: '12 Active', icon: FolderKanban, link: 'projects' },
    { label: 'Cloud Storage', value: '1.4 / 5.0 GB', icon: HardDrive, link: 'billing' },
    { label: 'Subscription Plan', value: 'Pro Tier', icon: ShieldCheck, link: 'billing' },
  ];

  return (
    <div className={styles.container}>
      {/* Welcome Banner */}
      <motion.div 
        className={`${styles.banner} glass-panel`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className={styles.bannerInfo}>
          <span className={styles.badge}>SNEAKER FLOW 3D</span>
          <h1 className={styles.bannerTitle}>Keep Creating, <span className="text-gradient-orange">Duy Nguyen</span></h1>
          <p className={styles.bannerDesc}>
            Manage your mobile scans, billing, and system configurations. Sync shoe assets instantly to the Desktop App for full 3D rendering.
          </p>
          <div className={styles.bannerActions}>
            <button className="btn-neon-orange" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`${styles.icon} ${syncing ? styles.spin : ''}`} size={18} />
              {syncing ? 'Syncing assets...' : 'Sync Cloud Scan'}
            </button>
            <button className="btn-outline" onClick={() => alert('Downloading KusShoes Desktop v1.4.2')}>
              <Download size={18} />
              Get Desktop App
            </button>
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
                <div className={styles.statIconWrapper}>
                  <Icon size={20} className={styles.statIcon} />
                </div>
              </div>
              <div className={styles.statValue}>{stat.value}</div>
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
          <div className={styles.logList}>
            {syncLogs.map(log => (
              <div key={log.id} className={styles.logItem}>
                <div className={styles.logIndicator} />
                <div className={styles.logBody}>
                  <p className={styles.logText}>{log.text}</p>
                  <span className={styles.logTime}>{log.time}</span>
                </div>
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
  );
};
