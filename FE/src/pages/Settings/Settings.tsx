import React, { useEffect, useState } from 'react';
import {
  User, Shield, Eye, Smartphone, Save, Key, Palette,
  Instagram, Globe, Camera, Award, X, Upload, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Tabs from '@radix-ui/react-tabs';
import styles from './Settings.module.css';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { api, type Usage } from '../../api/client';
import { TwoFactorPanel } from './TwoFactorPanel';
import { SessionsPanel } from './SessionsPanel';
import { PrivacyPanel } from './PrivacyPanel';

type SettingTab = 'profile' | 'security' | 'privacy' | 'appearance';

interface PresetAvatar {
  name: string;
  url: string;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingTab>('profile');
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

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
    name: '',
    email: '',
    role: 'Sneaker Designer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
    studioName: '',
    location: '',
    bio: '',
    instagram: '',
    behance: '',
    tiktok: ''
  });
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    api.profile()
      .then((profile) => {
        setProfileData((current) => ({
          ...current,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          email: profile.email,
          bio: profile.bio ?? '',
          avatar: api.avatarUrl(profile.avatar_path) ?? current.avatar,
        }));
      })
      .catch((caught) => toast(caught instanceof Error ? caught.message : 'Unable to load profile.', 'error'));
  }, [toast]);

  useEffect(() => {
    api.usage().then(setUsage).catch(() => setUsage(null)); // the banner degrades to name + email
  }, []);

  // Avatar Modal State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  // Security settings
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });


  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const [firstName, ...lastNameParts] = profileData.name.trim().split(/\s+/);
    setSaving(true);
    try {
      await api.updateProfile({
        first_name: firstName,
        last_name: lastNameParts.join(' '),
        bio: profileData.bio.trim() || null,
      });
      toast('Profile saved to the server.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to save profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast('New passwords do not match!', 'error');
      return;
    }
    setSaving(true);
    try {
      const message = await api.changePassword(passwordForm);
      toast(message || 'Password updated. Please sign in again.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to update password.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    setProfileData(prev => ({ ...prev, avatar: url }));
    toast('Preset preview selected. Upload a local image to persist an avatar on the server.', 'info');
  };

  const handleCustomUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadProgress(true);
    try {
      const profile = await api.uploadAvatar(file);
      setProfileData(prev => ({
        ...prev,
        avatar: api.avatarUrl(profile.avatar_path) ?? URL.createObjectURL(file),
      }));
      setIsAvatarModalOpen(false);
      toast('Avatar uploaded to the server.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to upload avatar.', 'error');
    } finally {
      setUploadProgress(false);
      event.target.value = '';
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Account Settings</h1>
          <p className={styles.subtitle}>Configure your designer profile, toggle security protocols, and manage model privacy.</p>
        </div>
      </div>

      {/* Settings Layout */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as SettingTab)}
        className={styles.settingsLayout}
        style={{ display: 'contents' }}
      >
        {/* Profile banner: who you are and what you use, in one row */}
        <div className={`${styles.profileBanner} glass-panel`}>
          <div className={styles.bannerAvatar} onClick={() => setIsAvatarModalOpen(true)} title="Change photo">
            <img src={profileData.avatar} alt="Avatar" className={styles.bannerAvatarImg} />
            <div className={styles.bannerAvatarOverlay}><Camera size={16} /></div>
          </div>
          <div className={styles.bannerIdentity}>
            <h3 className={styles.bannerName}>{profileData.name || 'Your profile'}</h3>
            <p className={styles.bannerEmail}>{profileData.email}</p>
          </div>
          <div className={styles.bannerChips}>
            {usage && (
              <>
                <span className={styles.bannerChip}>
                  <Award size={12} className={styles.badgeIcon} />
                  <span style={{ textTransform: 'capitalize' }}>{usage.tier.replace(/_/g, ' ')}</span>
                </span>
                <span className={styles.bannerChip}>
                  {usage.projects_count} / {usage.max_projects ?? '∞'} projects
                </span>
                <span className={styles.bannerChip}>
                  {usage.exports_count} / {usage.max_exports_per_month ?? '∞'} exports
                </span>
              </>
            )}
          </div>
          <div className={styles.socialLinksRow}>
            {profileData.instagram && (
              <a href={`https://instagram.com/${profileData.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className={styles.socialIconBtn} title="Instagram Portfolio">
                <Instagram size={16} />
              </a>
            )}
            {profileData.behance && (
              <a href={`https://behance.net/${profileData.behance}`} target="_blank" rel="noreferrer" className={styles.socialIconBtn} title="Behance Portfolio">
                <Globe size={16} />
              </a>
            )}
            {profileData.tiktok && (
              <a href={`https://tiktok.com/${profileData.tiktok}`} target="_blank" rel="noreferrer" className={styles.socialIconBtn} title="TikTok Designs">
                <Smartphone size={16} />
              </a>
            )}
          </div>
        </div>

        {/* Navigation Tabs (horizontal) */}
        <Tabs.List className={`${styles.tabsColumn} glass-panel`}>
          <Tabs.Trigger value="profile" className={`${styles.tabItem} ${activeTab === 'profile' ? styles.active : ''}`}>
            <User size={18} />
            <span>Profile Details</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="security" className={`${styles.tabItem} ${activeTab === 'security' ? styles.active : ''}`}>
            <Shield size={18} />
            <span>Security & Auth</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="privacy" className={`${styles.tabItem} ${activeTab === 'privacy' ? styles.active : ''}`}>
            <Eye size={18} />
            <span>Privacy & Data</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="appearance" className={`${styles.tabItem} ${activeTab === 'appearance' ? styles.active : ''}`}>
            <Palette size={18} />
            <span>Appearance</span>
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab Content Panel */}
        <div className={`${styles.contentColumn} glass-panel`}>
          <AnimatePresence mode="wait">
            {activeTab === 'profile' && (
              <Tabs.Content value="profile" forceMount asChild>
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                {/* Right Column: Profile forms */}
                <form onSubmit={handleProfileSave} className={`${styles.form} ${styles.profileColumns}`}>
                  <div className={`${styles.sectionHeaderCompact} ${styles.spanAll}`}>
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
                            className={styles.input}
                            readOnly
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
                    <div className={`${styles.formSectionGroup} ${styles.spanAll}`}>
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

                    <button type="submit" className={`btn-neon-orange ${styles.spanAll}`} style={{ justifySelf: 'flex-start' }} disabled={saving}>
                      <Save size={16} />
                      <span>Save Profile Settings</span>
                    </button>
                  </form>
              </motion.div>
              </Tabs.Content>
            )}

            {activeTab === 'security' && (
              <Tabs.Content value="security" forceMount asChild>
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

                <div className={styles.twoColGrid}>
                {/* 2FA (real: setup / enable / disable / recovery codes) */}
                <TwoFactorPanel />

                {/* Change Password Form */}
                <form onSubmit={handlePasswordSave} className={`${styles.form} ${styles.passwordCard} glass-panel`}>
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

                  <button type="submit" className="btn-neon-orange" style={{ alignSelf: 'flex-start' }} disabled={saving}>
                    <Save size={16} />
                    Update Password
                  </button>
                </form>

                <SessionsPanel />
                </div>
              </motion.div>
              </Tabs.Content>
            )}

            {activeTab === 'privacy' && (
              <Tabs.Content value="privacy" forceMount asChild>
              <motion.div
                key="privacy"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                <h2 className={styles.sectionTitle}>Privacy & Data</h2>
                <p className={styles.sectionSubtitle}>Control who can see your work, what you consent to, and your personal data.</p>

                <PrivacyPanel />
              </motion.div>
              </Tabs.Content>
            )}

            {activeTab === 'appearance' && (
              <Tabs.Content value="appearance" forceMount asChild>
              <motion.div
                key="appearance"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className={styles.tabContent}
              >
                <h2 className={styles.sectionTitle}>Appearance</h2>
                <p className={styles.sectionSubtitle}>Pick how the KusShoes workspace looks. The choice is remembered on this device.</p>
                    <div className={styles.appearanceGroup}>
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
                            toast('Theme set to Streetwear Dark');
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
                            toast('Theme set to Premium Cream');
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

              </motion.div>
              </Tabs.Content>
            )}
          </AnimatePresence>
        </div>
      </Tabs.Root>

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

            {/* Custom avatar upload */}
            <div className={styles.uploadArea}>
              {uploadProgress ? (
                <div className={styles.uploadProgress}>
                  <RefreshCw className={styles.spinIcon} size={20} />
                  <span>Uploading mesh file avatar...</span>
                </div>
              ) : (
                <label className="btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCustomUpload}
                    style={{ display: 'none' }}
                  />
                  <Upload size={16} />
                  <span>Upload custom photo (.png, .jpg)</span>
                </label>
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
