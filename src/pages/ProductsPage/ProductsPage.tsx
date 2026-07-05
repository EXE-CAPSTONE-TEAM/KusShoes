import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { 
  Smartphone, Monitor, Download, Apple, Play, Cpu, 
  Layers, Zap, Shield, CheckCircle2, ChevronRight,
  AppWindow, HardDrive, Sparkles
} from 'lucide-react';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { Select } from '../../components/Select/Select';
import { useToast } from '../../context/ToastContext';
import styles from './ProductsPage.module.css';

interface ProductsPageProps {
  navigate: (path: string) => void;
}

const DESKTOP_OS_OPTIONS = [
  { value: 'windows', label: 'Windows 10/11 (.EXE)' },
  { value: 'mac-silicon', label: 'macOS Apple Silicon (M1/M2/M3 .DMG)' },
  { value: 'mac-intel', label: 'macOS Intel Core (.DMG)' },
];

export const ProductsPage: React.FC<ProductsPageProps> = ({ navigate }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>('ios');
  const [desktopOS, setDesktopOS] = useState<'windows' | 'mac-silicon' | 'mac-intel'>('windows');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    }
  };

  const handleDownload = (appName: string, platform: string) => {
    toast(`Starting download for ${appName} (${platform}). Thank you for participating in our beta test!`);
  };

  return (
    <div className={styles.container}>
      {/* Background canvas effects */}
      <InteractiveParticleGrid />
      <div className={styles.bgGlow1} />
      <div className={styles.bgGlow2} />

      <Navbar navigate={navigate} currentPage="products" />

      <main className={styles.mainContent}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className={styles.heroHeader}
          >
            <span className={styles.badge}>THE DUAL-APP ECOSYSTEM</span>
            <h1 className={styles.mainTitle}>
              SCAN WITH <span className="text-gradient-orange">KUSSHOES</span>.<br />
              DESIGN IN <span className="text-gradient-orange">KUSSTUDIO</span>.
            </h1>
            <p className={styles.heroSubtitle}>
              Two dedicated tools working in perfect unison. Capture physical geometry in real-world spaces with our mobile app, and apply pro-grade textures, colors, and designs on your desktop device.
            </p>
          </motion.div>
        </section>

        {/* Product Cards Row */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className={styles.productsGrid}
        >
          {/* Card 1: KusShoes Mobile */}
          <motion.div variants={itemVariants} className={`${styles.productCard} glass-panel`}>
            <div className={styles.cardHeader}>
              <div className={styles.iconWrapperMobile}>
                <Smartphone size={28} />
              </div>
              <div>
                <span className={styles.productTag}>MOBILE CAPTURE APP</span>
                <h2 className={styles.cardTitle}>KusShoes App</h2>
              </div>
            </div>

            <p className={styles.cardDescription}>
              Transform your physical sneaker collection into high-fidelity 3D digital twins. Just take a series of photos of any shoe using your mobile phone, and let our photogrammetry engine do the rest.
            </p>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <Sparkles size={16} className={styles.specIcon} />
                <span>Kiri Engine photogrammetry API reconstruction</span>
              </div>
              <div className={styles.specItem}>
                <Cpu size={16} className={styles.specIcon} />
                <span>LiDAR scanning integration for depth mapping</span>
              </div>
              <div className={styles.specItem}>
                <Layers size={16} className={styles.specIcon} />
                <span>Auto-extraction of upper mesh and sole boundaries</span>
              </div>
              <div className={styles.specItem}>
                <CheckCircle2 size={16} className={styles.specIcon} />
                <span>Instant upload & sync to secure Cloud Vault</span>
              </div>
            </div>

            {/* Mobile Download Interface */}
            <div className={styles.downloadBox}>
              <h3 className={styles.downloadTitle}>Select Platform</h3>
              <div className={styles.tabButtons}>
                <button 
                  onClick={() => setActiveTab('ios')}
                  className={`${styles.tabBtn} ${activeTab === 'ios' ? styles.tabBtnActive : ''}`}
                >
                  <Apple size={16} /> iOS
                </button>
                <button 
                  onClick={() => setActiveTab('android')}
                  className={`${styles.tabBtn} ${activeTab === 'android' ? styles.tabBtnActive : ''}`}
                >
                  <Play size={14} /> Android
                </button>
              </div>

              <div className={styles.downloadDetails}>
                {activeTab === 'ios' ? (
                  <div className={styles.platformMeta}>
                    <span>Version 1.4.2 (Beta) • iOS 16.0 or higher</span>
                    <button 
                      className="btn-neon-orange" 
                      style={{ width: '100%', marginTop: '12px' }}
                      onClick={() => handleDownload('KusShoes', 'iOS (.IPA)')}
                    >
                      <Download size={18} /> Download TestFlight IPA
                    </button>
                  </div>
                ) : (
                  <div className={styles.platformMeta}>
                    <span>Version 1.4.0 (Beta) • Android 11.0 or higher</span>
                    <button 
                      className="btn-neon-orange" 
                      style={{ width: '100%', marginTop: '12px' }}
                      onClick={() => handleDownload('KusShoes', 'Android (.APK)')}
                    >
                      <Download size={18} /> Download APK Installer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Card 2: KusStudio Desktop */}
          <motion.div variants={itemVariants} className={`${styles.productCard} glass-panel`}>
            <div className={styles.cardHeader}>
              <div className={styles.iconWrapperDesktop}>
                <Monitor size={28} />
              </div>
              <div>
                <span className={styles.productTag}>DESKTOP DESIGN SUITE</span>
                <h2 className={styles.cardTitle}>KusStudio Desktop</h2>
              </div>
            </div>

            <p className={styles.cardDescription}>
              The ultimate 3D shoe customizer interface. Load your synced mobile scans instantly, map colors, modify materials, apply custom graphics, and export print-ready assets.
            </p>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <Zap size={16} className={styles.specIcon} />
                <span>Hardware-accelerated real-time WebGL renderer</span>
              </div>
              <div className={styles.specItem}>
                <AppWindow size={16} className={styles.specIcon} />
                <span>Multi-layer canvas painting and custom stickers overlay</span>
              </div>
              <div className={styles.specItem}>
                <HardDrive size={16} className={styles.specIcon} />
                <span>GLTF, OBJ, FBX, and Apple USDZ 3D model exports</span>
              </div>
              <div className={styles.specItem}>
                <Shield size={16} className={styles.specIcon} />
                <span>Local daemon compiler server listening on port 8421</span>
              </div>
            </div>

            {/* Desktop Download Interface */}
            <div className={styles.downloadBox}>
              <h3 className={styles.downloadTitle}>Select Operating System</h3>
              <div className={styles.selectDropdownWrapper}>
                <Select
                  value={desktopOS}
                  onValueChange={(v) => setDesktopOS(v as any)}
                  options={DESKTOP_OS_OPTIONS}
                  ariaLabel="Select desktop operating system"
                />
              </div>

              <div className={styles.downloadDetails}>
                <div className={styles.platformMeta}>
                  {desktopOS === 'windows' && <span>File size: 142 MB • Minimum: GTX 1060 / 8GB RAM</span>}
                  {desktopOS === 'mac-silicon' && <span>File size: 128 MB • Fully native for Apple M-series</span>}
                  {desktopOS === 'mac-intel' && <span>File size: 135 MB • Requires macOS 12.0 or higher</span>}
                  
                  <button 
                    className="btn-neon-orange" 
                    style={{ width: '100%', marginTop: '12px' }}
                    onClick={() => handleDownload('KusStudio', desktopOS)}
                  >
                    <Download size={18} /> Download Desktop Installer
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Unified Workflow Callout */}
        <motion.section 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className={`${styles.workflowCallout} glass-panel`}
        >
          <div className={styles.calloutGrid}>
            <div className={styles.calloutText}>
              <h3 className={styles.calloutTitle}>How They Sync</h3>
              <p>
                When you scan a sneaker using the mobile <strong>KusShoes App</strong>, the photogrammetry scans compile directly in our Cloud Vault. Upon launching <strong>KusStudio Desktop</strong>, the application detects your active cloud workspace and syncs all scans in less than 3 seconds. The desktop suite also hosts a local listener that communicates directly with your portal web browser.
              </p>
              <button className="btn-outline" onClick={() => navigate('/login')} style={{ marginTop: '16px' }}>
                Go to Portal Console <ChevronRight size={16} />
              </button>
            </div>
            <div className={styles.syncGraphic}>
              <div className={styles.graphicPhone}>
                <Smartphone size={32} />
                <span>KusShoes</span>
              </div>
              <div className={styles.graphicArrow}>
                <Zap size={20} className={styles.zapIconAnim} />
                <span className={styles.syncSpeedText}>Cloud Sync</span>
              </div>
              <div className={styles.graphicDesktop}>
                <Monitor size={32} />
                <span>KusStudio</span>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      <Footer navigate={navigate} />
    </div>
  );
};
