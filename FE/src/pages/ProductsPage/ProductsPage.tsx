import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  Smartphone, Monitor, Download, Apple, Play, Cpu,
  Layers, Zap, Shield, CheckCircle2, ChevronRight,
  AppWindow, HardDrive, Sparkles
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { Select } from '../../components/Select/Select';
import { useToast } from '../../context/ToastContext';
import { useAndroidRelease, useDesktopRelease } from '../../hooks/useDesktopRelease';
import { DESKTOP_INSTALLER_URL } from '../../utils/desktopRelease';
import styles from './ProductsPage.module.css';

interface ProductsPageProps {
  navigate: (path: string) => void;
}

type DesktopOS = 'windows' | 'mac-silicon' | 'mac-intel';

function isDesktopOS(value: string): value is DesktopOS {
  return value === 'windows' || value === 'mac-silicon' || value === 'mac-intel';
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ navigate }) => {
  const { t } = useTranslation('products');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>('android');
  const [desktopOS, setDesktopOS] = useState<DesktopOS>('windows');
  const desktopRelease = useDesktopRelease();
  const androidRelease = useAndroidRelease();

  const DESKTOP_OS_OPTIONS: Array<{ value: DesktopOS; label: string }> = [
    { value: 'windows', label: t('osOptions.windows') },
    { value: 'mac-silicon', label: t('osOptions.macSilicon') },
    { value: 'mac-intel', label: t('osOptions.macIntel') },
  ];

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

  const handleAndroidDownload = () => {
    if (androidRelease?.status !== 'available') {
      toast(t('mobile.noApkYet'));
      return;
    }
    toast(t('downloadToast', { appName: 'KusShoes', platform: 'Android' }));
    window.location.assign(androidRelease.url);
  };

  const handleDesktopDownload = () => {
    if (desktopOS !== 'windows') {
      toast(t('desktop.macComingSoon'));
      return;
    }
    if (desktopRelease?.status === 'none') {
      toast(t('desktop.noInstallerYet'));
      return;
    }
    toast(t('downloadToast', { appName: 'KusShoes Editor', platform: 'Windows' }));
    window.location.assign(DESKTOP_INSTALLER_URL);
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
            <span className={styles.badge}>{t('badge')}</span>
            <h1 className={styles.mainTitle}>
              {t('heroTitleLine1Prefix')} <span className="text-gradient-orange">KUSSHOES</span>.<br />
              {t('heroTitleLine2Prefix')} <span className="text-gradient-orange">KUSSTUDIO</span>.
            </h1>
            <p className={styles.heroSubtitle}>{t('heroSubtitle')}</p>
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
                <span className={styles.productTag}>{t('mobile.tag')}</span>
                <h2 className={styles.cardTitle}>KusShoes App</h2>
              </div>
            </div>

            <p className={styles.cardDescription}>{t('mobile.description')}</p>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <Sparkles size={16} className={styles.specIcon} />
                <span>{t('mobile.spec1')}</span>
              </div>
              <div className={styles.specItem}>
                <Cpu size={16} className={styles.specIcon} />
                <span>{t('mobile.spec2')}</span>
              </div>
              <div className={styles.specItem}>
                <Layers size={16} className={styles.specIcon} />
                <span>{t('mobile.spec3')}</span>
              </div>
              <div className={styles.specItem}>
                <CheckCircle2 size={16} className={styles.specIcon} />
                <span>{t('mobile.spec4')}</span>
              </div>
            </div>

            {/* Mobile Download Interface */}
            <div className={styles.downloadBox}>
              <h3 className={styles.downloadTitle}>{t('mobile.selectPlatform')}</h3>
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
                    <span>{t('mobile.iosMeta')}</span>
                    <button
                      className="btn-neon-orange"
                      style={{ width: '100%', marginTop: '12px' }}
                      onClick={() => toast(t('mobile.iosComingSoon'))}
                    >
                      <Download size={18} /> {t('mobile.downloadIos')}
                    </button>
                  </div>
                ) : (
                  <div className={styles.platformMeta}>
                    <span>{t('mobile.androidMeta')}</span>
                    <button
                      className="btn-neon-orange"
                      style={{ width: '100%', marginTop: '12px' }}
                      onClick={handleAndroidDownload}
                    >
                      <Download size={18} /> {t('mobile.downloadAndroid')}
                      {androidRelease?.status === 'available' ? ` v${androidRelease.version}` : ''}
                    </button>
                    {androidRelease?.status === 'available' && (
                      <span style={{ display: 'block', marginTop: '8px', fontSize: '0.8rem', opacity: 0.8 }}>
                        {t('mobile.apkInstallHint')}
                      </span>
                    )}
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
                <span className={styles.productTag}>{t('desktop.tag')}</span>
                <h2 className={styles.cardTitle}>KusStudio Desktop</h2>
              </div>
            </div>

            <p className={styles.cardDescription}>{t('desktop.description')}</p>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <Zap size={16} className={styles.specIcon} />
                <span>{t('desktop.spec1')}</span>
              </div>
              <div className={styles.specItem}>
                <AppWindow size={16} className={styles.specIcon} />
                <span>{t('desktop.spec2')}</span>
              </div>
              <div className={styles.specItem}>
                <HardDrive size={16} className={styles.specIcon} />
                <span>{t('desktop.spec3')}</span>
              </div>
              <div className={styles.specItem}>
                <Shield size={16} className={styles.specIcon} />
                <span>{t('desktop.spec4')}</span>
              </div>
            </div>

            {/* Desktop Download Interface */}
            <div className={styles.downloadBox}>
              <h3 className={styles.downloadTitle}>{t('desktop.selectOs')}</h3>
              <div className={styles.selectDropdownWrapper}>
                <Select
                  value={desktopOS}
                  onValueChange={(value) => {
                    if (isDesktopOS(value)) setDesktopOS(value);
                  }}
                  options={DESKTOP_OS_OPTIONS}
                  ariaLabel={t('selectDesktopOsAria')}
                />
              </div>

              <div className={styles.downloadDetails}>
                <div className={styles.platformMeta}>
                  {desktopOS === 'windows' && <span>{t('desktop.windowsMeta')}</span>}
                  {desktopOS === 'mac-silicon' && <span>{t('desktop.macSiliconMeta')}</span>}
                  {desktopOS === 'mac-intel' && <span>{t('desktop.macIntelMeta')}</span>}

                  <button
                    className="btn-neon-orange"
                    style={{ width: '100%', marginTop: '12px' }}
                    onClick={handleDesktopDownload}
                  >
                    <Download size={18} /> {t('desktop.downloadInstaller')}
                    {desktopOS === 'windows' && desktopRelease?.status === 'available'
                      ? ` v${desktopRelease.version}`
                      : ''}
                  </button>
                  {desktopOS === 'windows' && desktopRelease?.status !== 'none' && (
                    <span style={{ display: 'block', marginTop: '8px', fontSize: '0.8rem', opacity: 0.8 }}>
                      {t('desktop.smartScreenHint')}
                    </span>
                  )}
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
              <h3 className={styles.calloutTitle}>{t('workflow.title')}</h3>
              <p>
                <Trans i18nKey="workflow.desc" t={t} components={{ b1: <strong />, b2: <strong /> }} />
              </p>
              <button className="btn-outline" onClick={() => navigate('/login')} style={{ marginTop: '16px' }}>
                {t('workflow.cta')} <ChevronRight size={16} />
              </button>
            </div>
            <div className={styles.syncGraphic}>
              <div className={styles.graphicPhone}>
                <Smartphone size={32} />
                <span>KusShoes</span>
              </div>
              <div className={styles.graphicArrow}>
                <Zap size={20} className={styles.zapIconAnim} />
                <span className={styles.syncSpeedText}>{t('workflow.cloudSync')}</span>
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
