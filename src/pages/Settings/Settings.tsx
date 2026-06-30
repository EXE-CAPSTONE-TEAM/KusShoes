import React, { useState } from 'react';
import { 
  User, Shield, Eye, Smartphone, Save, Key, AlertTriangle,
  Instagram, Globe, Camera, Award, Check, X, Upload, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Settings.module.css';
import { useTheme } from '../../context/ThemeContext';

type SettingTab = 'profile' | 'security' | 'privacy';

interface PresetAvatar {
  name: string;
  url: string;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingTab>('profile');
  const { theme, setTheme } = useTheme();
  
  // Toast Notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Curated Preset Avatars
  const presetAvatars: PresetAvatar[] = [
    { name: 'Urban Hypebeast', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80' },
    { name: 'Techwear Goggles', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80' },
    { name: 'Pixel Sneakerhead', url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80' },
    { name: 'Graffiti Artist', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80' },
    { name: 'Vaporwave Face', url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80' }
  ];

  // Profile data state
  const [profileData, setProfileData] = useState({
    name: 'Duy Nguyen',
    email: 'duy.nguyen@sneakerflow.com',
    role: 'Sneaker Designer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
    studioName: 'KusStudio HCMC',
    location: 'Ho Chi Minh City, VN',
    bio: 'Shape your shoes, show your style. Specializing in high-poly 3D photogrammetry reconstructions. Custom leather painting mapping on Air Force 1s & Jordans.',
    instagram: '@duy.sneakerflow',
    behance: 'duynguyendesigner',
    tiktok: '@duy.design3d'
  });

  // Avatar Modal State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  // Security settings
  const [is2FaEnabled, setIs2FaEnabled] = useState(true);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Privacy settings
  const [shoeVisibility, setShoeVisibility] = useState('link'); // 'private' | 'link' | 'public'
  const [allowCloudSync, setAllowCloudSync] = useState(true);

  // Toast trigger utility
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    triggerToast('Profile configurations updated successfully!');
  };

  const handlePasswordSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New passwords do not match!');
      return;
    }
    triggerToast('Security password has been updated!');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleSelectPresetAvatar = (url: string) => {
    setProfileData(prev => ({ ...prev, avatar: url }));
    setIsAvatarModalOpen(false);
    triggerToast('Avatar updated successfully!');
  };

  const handleCustomUploadSimulate = () => {
    setUploadProgress(true);
    setTimeout(() => {
      setUploadProgress(false);
      // Set to another mock hypebeast design
      setProfileData(prev => ({ 
        ...prev, 
        avatar: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=120&q=80' 
      }));
      setIsAvatarModalOpen(false);
      triggerToast('Custom avatar uploaded and synchronized!');
    }, 1500);
  };

  return (
    <div className={styles.container}>
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            className={`${styles.toast} glass-panel`}
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
          >
            <Check size={18} className={styles.toastIcon} />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Account Settings</h1>
          <p className={styles.subtitle}>Configure your designer profile, toggle security protocols, and manage model privacy.</p>
        </div>
      </div>

      {/* Settings Layout */}
      <div className={styles.settingsLayout}>
        {/* Navigation Tabs */}
        <div className={`${styles.tabsColumn} glass-panel`}>
          <button
            onClick={() => setActiveTab('profile')}
            className={`${styles.tabItem} ${activeTab === 'profile' ? styles.active : ''}`}
          >
            <User size={18} />
            <span>Profile Details</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`${styles.tabItem} ${activeTab === 'security' ? styles.active : ''}`}
          >
            <Shield size={18} />
            <span>Security & Auth</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`${styles.tabItem} ${activeTab === 'privacy' ? styles.active : ''}`}
          >
            <Eye size={18} />
            <span>Model Privacy</span>
          </button>
        </div>

        {/* Persistent Designer Profile Card */}
        <div className={`${styles.designerCard} glass-panel`}>
          <div className={styles.avatarWrapper} onClick={() => setIsAvatarModalOpen(true)}>
            <img src={profileData.avatar} alt="Avatar" className={styles.avatarLarge} />
            <div className={styles.avatarOverlay}>
              <Camera size={18} />
              <span>Change Photo</span>
            </div>
          </div>
          
          <h3 className={styles.cardName}>{profileData.name}</h3>
          <p className={styles.cardRoleText}>{profileData.role}</p>

          <div className={styles.badgeRow}>
            <span className={styles.badgeLabel}>
              <Award size={12} className={styles.badgeIcon} />
              <span>Pro Creator</span>
            </span>
            <span className={styles.badgeLabel}>Level 4</span>
          </div>

          <div className={styles.cardDivider} />

          {/* Stats */}
          <div className={styles.cardStatsGrid}>
            <div className={styles.cardStat}>
              <span className={styles.cardStatNum}>18</span>
              <span className={styles.cardStatLabel}>Cloud Scans</span>
            </div>
            <div className={styles.cardStat}>
              <span className={styles.cardStatNum}>42.5h</span>
              <span className={styles.cardStatLabel}>Studio Time</span>
            </div>
          </div>

          <div className={styles.cardDivider} />

          {/* Storage progress */}
          <div className={styles.cardStorageBox}>
            <div className={styles.storageHeader}>
              <span>Cloud Storage</span>
              <span>1.4 / 5.0 GB</span>
            </div>
            <div className={styles.storageBarBg}>
              <div className={styles.storageBarFill} style={{ width: '28%' }} />
            </div>
          </div>

          <div className={styles.cardDivider} />

          {/* Social links */}
          <div className={styles.socialQuickPanel}>
            <span className={styles.socialPanelTitle}>Studio Links</span>
            <div className={styles.socialLinksRow}>
              {profileData.instagram && (
                <a 
                  href={`https://instagram.com/${profileData.instagram.replace('@', '')}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={styles.socialIconBtn}
                  title="Instagram Portfolio"
                >
                  <Instagram size={16} />
                </a>
              )}
              {profileData.behance && (
                <a 
                  href={`https://behance.net/${profileData.behance}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={styles.socialIconBtn}
                  title="Behance Portfolio"
                >
                  <Globe size={16} />
                </a>
              )}
              {profileData.tiktok && (
                <a 
                  href={`https://tiktok.com/${profileData.tiktok}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={styles.socialIconBtn}
                  title="TikTok Designs"
                >
                  <Smartphone size={16} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content Panel */}
        <div className={`${styles.contentColumn} glass-panel`}>
          <AnimatePresence mode="wait">
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                {/* Right Column: Profile forms */}
                <form onSubmit={handleProfileSave} className={styles.form}>
                  <div className={styles.sectionHeaderCompact}>
                    <h2 className={styles.sectionTitle}>Profile Details</h2>
                    <p className={styles.sectionSubtitle}>Manage public information regarding your designer account profile.</p>
                  </div>

                    {/* Group A: Designer Identity */}
                    <div className={styles.formSectionGroup}>
                      <h4 className={styles.formGroupTitle}>Designer Identity</h4>
                      <div className={styles.formGrid}>
                        <div className={styles.inputGroup}>
                          <label>Designer Name</label>
                          <input
                            type="text"
                            value={profileData.name}
                            onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                            className={styles.input}
                            required
                          />
                        </div>
                        <div className={styles.inputGroup}>
                          <label>Email Address</label>
                          <input
                            type="email"
                            value={profileData.email}
                            onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                            className={styles.input}
                            required
                          />
                        </div>
                        <div className={styles.inputGroup}>
                          <label>Primary Role</label>
                          <input
                            type="text"
                            value={profileData.role}
                            onChange={(e) => setProfileData({ ...profileData, role: e.target.value })}
                            className={styles.input}
                            required
                          />
                        </div>
                        <div className={styles.inputGroup}>
                          <label>Studio Location</label>
                          <input
                            type="text"
                            value={profileData.location}
                            onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                            className={styles.input}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Group B: Studio Bio */}
                    <div className={styles.formSectionGroup}>
                      <h4 className={styles.formGroupTitle}>Studio Bio & Slogan</h4>
                      <div className={styles.inputGroupFull}>
                        <label>Creative Bio</label>
                        <textarea
                          value={profileData.bio}
                          onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                          className={styles.textarea}
                          rows={4}
                          placeholder="Introduce your shoe customizer studio brand..."
                          required
                        />
                      </div>
                    </div>

                    {/* Group C: Connected Portfolios */}
                    <div className={styles.formSectionGroup}>
                      <h4 className={styles.formGroupTitle}>Connected Showcase Handles</h4>
                      <div className={styles.formGrid}>
                        <div className={styles.inputGroup}>
                          <label>Instagram Handle</label>
                          <div className={styles.inputWithIconWrapper}>
                            <Instagram size={14} className={styles.fieldIcon} />
                            <input
                              type="text"
                              value={profileData.instagram}
                              onChange={(e) => setProfileData({ ...profileData, instagram: e.target.value })}
                              className={styles.input}
                              placeholder="@duy.sneaker"
                            />
                          </div>
                        </div>
                        <div className={styles.inputGroup}>
                          <label>Behance Username</label>
                          <div className={styles.inputWithIconWrapper}>
                            <Globe size={14} className={styles.fieldIcon} />
                            <input
                              type="text"
                              value={profileData.behance}
                              onChange={(e) => setProfileData({ ...profileData, behance: e.target.value })}
                              className={styles.input}
                              placeholder="duynguyen"
                            />
                          </div>
                        </div>
                        <div className={styles.inputGroup}>
                          <label>TikTok Handle</label>
                          <div className={styles.inputWithIconWrapper}>
                            <Smartphone size={14} className={styles.fieldIcon} />
                            <input
                              type="text"
                              value={profileData.tiktok}
                              onChange={(e) => setProfileData({ ...profileData, tiktok: e.target.value })}
                              className={styles.input}
                              placeholder="@duy.hypebeast"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Group D: Theme Preferences */}
                    <div className={styles.formSectionGroup}>
                      <h4 className={styles.formGroupTitle}>Theme Preferences</h4>
                      <p className={styles.inputLabelDesc} style={{ marginBottom: '16px' }}>
                        Choose the primary look and feel for your KusShoes workspace.
                      </p>
                      
                      <div className={styles.themeSelectorGrid}>
                        {/* Dark Theme Card */}
                        <div 
                          className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
                          onClick={() => {
                            setTheme('dark');
                            triggerToast('Theme set to Streetwear Dark');
                          }}
                        >
                          <div className={styles.themeCardPreviewDark}>
                            <div className={styles.previewSidebar} />
                            <div className={styles.previewContent}>
                              <div className={styles.previewHeader} />
                              <div className={styles.previewItem} />
                              <div className={styles.previewItemSub} />
                            </div>
                          </div>
                          <div className={styles.themeCardMeta}>
                            <span className={styles.themeCardTitle}>Streetwear Dark</span>
                            <span className={styles.themeCardDesc}>Default neon-accented dark system</span>
                          </div>
                        </div>

                        {/* Light Theme Card */}
                        <div 
                          className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
                          onClick={() => {
                            setTheme('light');
                            triggerToast('Theme set to Premium Cream');
                          }}
                        >
                          <div className={styles.themeCardPreviewLight}>
                            <div className={styles.previewSidebar} />
                            <div className={styles.previewContent}>
                              <div className={styles.previewHeader} />
                              <div className={styles.previewItem} />
                              <div className={styles.previewItemSub} />
                            </div>
                          </div>
                          <div className={styles.themeCardMeta}>
                            <span className={styles.themeCardTitle}>Premium Cream</span>
                            <span className={styles.themeCardDesc}>Warm editorial streetwear look</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button type="submit" className="btn-neon-orange" style={{ alignSelf: 'flex-start' }}>
                      <Save size={16} />
                      <span>Save Profile Settings</span>
                    </button>
                  </form>
              </motion.div>
            )}

            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                <h2 className={styles.sectionTitle}>Security & Credentials</h2>
                <p className={styles.sectionSubtitle}>Change password tokens and adjust identity verification credentials.</p>

                {/* 2FA Section */}
                <div className={`${styles.securityBox} glass-panel`}>
                  <div className={styles.securityBoxHeader}>
                    <Smartphone size={20} className={styles.securityIcon} />
                    <div>
                      <h4 className={styles.securityBoxTitle}>Two-Factor Authentication (2FA)</h4>
                      <p className={styles.securityBoxDesc}>Add an extra layer of security to prevent unauthorized sync actions.</p>
                    </div>
                    <button 
                      className={`${styles.toggleBtn} ${is2FaEnabled ? styles.toggleActive : ''}`}
                      onClick={() => setIs2FaEnabled(!is2FaEnabled)}
                    >
                      <div className={styles.toggleKnob} />
                    </button>
                  </div>
                </div>

                {/* Change Password Form */}
                <form onSubmit={handlePasswordSave} className={styles.form} style={{ marginTop: '12px' }}>
                  <h3 className={styles.subFormTitle}>
                    <Key size={16} />
                    Update Password
                  </h3>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label>Current Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Confirm New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        className={styles.input}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-neon-orange" style={{ alignSelf: 'flex-start' }}>
                    <Save size={16} />
                    Update Password
                  </button>
                </form>
              </motion.div>
            )}

            {activeTab === 'privacy' && (
              <motion.div
                key="privacy"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                <h2 className={styles.sectionTitle}>Model Visibility & Sync Privacy</h2>
                <p className={styles.sectionSubtitle}>Define who can preview your sneaker designs and control cloud uploads.</p>

                <div className={styles.form}>
                  {/* Default visibility select */}
                  <div className={styles.inputGroup}>
                    <label>Default Project Visibility</label>
                    <p className={styles.inputLabelDesc}>Default setting when a shoe model is synchronized from the mobile scanner.</p>
                    
                    <div className={styles.radioGrid}>
                      {[
                        { value: 'private', title: 'Private', desc: 'Only visible to you and your synced desktop client.' },
                        { value: 'link', title: 'Shareable Link', desc: 'Anyone with the secure preview URL can rotate the shoe model.' },
                        { value: 'public', title: 'Public Community', desc: 'Discoverable in the KusShoes community showcase.' },
                      ].map((option) => (
                        <div 
                          key={option.value} 
                          className={`${styles.radioCard} ${shoeVisibility === option.value ? styles.radioActive : ''}`}
                          onClick={() => setShoeVisibility(option.value)}
                        >
                          <div className={styles.radioIndicator}>
                            {shoeVisibility === option.value && <div className={styles.radioDot} />}
                          </div>
                          <div>
                            <h4 className={styles.radioTitle}>{option.title}</h4>
                            <p className={styles.radioDesc}>{option.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sync switch */}
                  <div className={styles.divider} />

                  <div className={styles.toggleRow}>
                    <div>
                      <h4 className={styles.toggleLabel}>Automatic Cloud Optimization</h4>
                      <p className={styles.toggleDesc}>Process shoe textures in high resolution inside our cloud photogrammetry server.</p>
                    </div>
                    <button 
                      className={`${styles.toggleBtn} ${allowCloudSync ? styles.toggleActive : ''}`}
                      onClick={() => setAllowCloudSync(!allowCloudSync)}
                    >
                      <div className={styles.toggleKnob} />
                    </button>
                  </div>

                  {/* Danger zone */}
                  <div className={styles.dangerZone}>
                    <div className={styles.dangerHeader}>
                      <AlertTriangle size={18} className={styles.dangerIcon} />
                      <h4 className={styles.dangerTitle}>Danger Zone</h4>
                    </div>
                    <p className={styles.dangerDesc}>Permanently delete your account profile and erase all 3D shoe designs. This action is irreversible.</p>
                    <button 
                      type="button" 
                      className={styles.deleteAccountBtn}
                      onClick={() => {
                        if (confirm('CRITICAL WARNING: Are you absolutely sure you want to permanently delete your KusShoes account? All 3D cloud data will be lost.')) {
                          alert('Account deletion request initiated.');
                        }
                      }}
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Interactive Avatar Picker Selector Modal */}
      {isAvatarModalOpen && (
        <div className={styles.modalBackdrop}>
          <motion.div 
            className={`${styles.modal} glass-panel`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Choose Designer Avatar</h3>
              <button className={styles.modalCloseBtn} onClick={() => setIsAvatarModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.modalDesc}>Select one of the pre-designed presets or upload a custom image file.</p>
            
            {/* Presets Grid */}
            <div className={styles.avatarGrid}>
              {presetAvatars.map((preset) => (
                <div 
                  key={preset.name}
                  className={`${styles.avatarGridItem} ${profileData.avatar === preset.url ? styles.avatarItemActive : ''}`}
                  onClick={() => handleSelectPresetAvatar(preset.url)}
                >
                  <img src={preset.url} alt={preset.name} className={styles.gridAvatarImg} />
                  <span className={styles.gridAvatarName}>{preset.name}</span>
                </div>
              ))}
            </div>

            <div className={styles.divider} style={{ margin: '16px 0' }} />

            {/* Custom Upload Simulation */}
            <div className={styles.uploadArea}>
              {uploadProgress ? (
                <div className={styles.uploadProgress}>
                  <RefreshCw className={styles.spinIcon} size={20} />
                  <span>Uploading mesh file avatar...</span>
                </div>
              ) : (
                <button className="btn-outline" onClick={handleCustomUploadSimulate} style={{ width: '100%', justifyContent: 'center' }}>
                  <Upload size={16} />
                  <span>Upload custom photo (.png, .jpg)</span>
                </button>
              )}
            </div>

            <div className={styles.modalActions} style={{ marginTop: '16px' }}>
              <button className="btn-outline" onClick={() => setIsAvatarModalOpen(false)}>Cancel</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
