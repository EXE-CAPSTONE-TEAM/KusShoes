import React, { useEffect, useState } from 'react';
import { Smartphone, Save, Key, Instagram, Globe, X, Upload, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Settings.module.css';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { DEFAULT_SETTING_TAB, SETTINGS_TABS, type SettingTab } from './settingsNavigation';
import { TwoFactorPanel } from './TwoFactorPanel';
import { SessionsPanel } from './SessionsPanel';
import { PrivacyPanel } from './PrivacyPanel';
import { ModerationStatusPanel } from './ModerationStatusPanel';

interface SettingsProps {
  activeTab?: SettingTab;
  onTabChange?: (tab: SettingTab) => void;
}

interface PresetAvatar {
  name: string;
  url: string;
}

export const Settings: React.FC<SettingsProps> = ({
  activeTab = DEFAULT_SETTING_TAB,
  onTabChange,
}) => {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [localTab, setLocalTab] = useState<SettingTab>(activeTab);

  useEffect(() => {
    setLocalTab(activeTab);
  }, [activeTab]);

  const currentTab = onTabChange ? activeTab : localTab;

  const handleTabClick = (tab: SettingTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setLocalTab(tab);
    }
  };

  // Curated Preset Avatars
  const presetAvatars: PresetAvatar[] = [
    {
      name: 'Urban Hypebeast',
      url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    },
    {
      name: 'Techwear Goggles',
      url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    },
    {
      name: 'Pixel Sneakerhead',
      url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80',
    },
    {
      name: 'Graffiti Artist',
      url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80',
    },
    {
      name: 'Vaporwave Face',
      url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80',
    },
  ];

  // Profile data state
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    role: 'Sneaker Designer',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
    studioName: '',
    location: '',
    bio: '',
    instagram: '',
    behance: '',
    tiktok: '',
  });
  const [saving, setSaving] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  useEffect(() => {
    api
      .profile()
      .then((profile) => {
        setAvatarPath(profile.avatar_path);
        setProfileData((current) => ({
          ...current,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          email: profile.email,
          bio: profile.bio ?? '',
          avatar: api.avatarUrl(profile.avatar_path) ?? current.avatar,
        }));
      })
      .catch((caught) =>
        toast(caught instanceof Error ? caught.message : 'Unable to load profile.', 'error'),
      );
  }, [toast]);

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
    setProfileData((prev) => ({ ...prev, avatar: url }));
    toast(
      'Preset preview selected. Upload a local image to persist an avatar on the server.',
      'info',
    );
  };

  const handleCustomUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadProgress(true);
    try {
      const profile = await api.uploadAvatar(file);
      setAvatarPath(profile.avatar_path);
      setProfileData((prev) => ({
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

  const handleRemoveAvatar = async () => {
    setUploadProgress(true);
    try {
      await api.deleteAvatar();
      setAvatarPath(null);
      setProfileData((prev) => ({ ...prev, avatar: presetAvatars[0].url }));
      toast('Avatar removed.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to remove avatar.', 'error');
    } finally {
      setUploadProgress(false);
    }
  };

  const tabLabels: Record<SettingTab, string> = {
    profile: 'Profile',
    security: 'Security',
    privacy: 'Privacy',
    appearance: 'Appearance',
  };

  return (
    <div className={styles.container}>
      {/* Header Block conforming to DESIGN.md 6.1 */}
      <div className={styles.headerBlock}>
        {/* Row 1 · 56px: Title */}
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Settings</h1>
        </div>

        {/* Row 2 · 40px: Underline tabs (DESIGN.md 5.4) */}
        <nav className={styles.tabs} role="tablist" aria-label="Settings navigation">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={currentTab === tab}
              className={`${styles.tab} ${currentTab === tab ? styles.tabActive : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Main Content Card */}
      <div className={styles.contentCard}>
        <AnimatePresence mode="wait">
          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={styles.tabContent}
            >
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Profile Details</h2>
                <p className={styles.sectionSubtitle}>
                  Manage public information regarding your designer account profile.
                </p>
              </div>

              {/* Designer Avatar Preview & Actions */}
              <div className={styles.avatarSection}>
                <div className={styles.avatarPreviewWrapper}>
                  <img
                    src={profileData.avatar}
                    alt={profileData.name || 'Avatar'}
                    className={styles.avatarPreviewImg}
                  />
                </div>
                <div className={styles.avatarDetails}>
                  <span className={styles.avatarName}>{profileData.name || 'Designer'}</span>
                  <span className={styles.avatarEmail}>{profileData.email}</span>
                  <div className={styles.avatarActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setIsAvatarModalOpen(true)}
                    >
                      Change avatar
                    </button>
                    {avatarPath && (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => void handleRemoveAvatar()}
                        disabled={uploadProgress}
                      >
                        Remove avatar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Details Form */}
              <form onSubmit={handleProfileSave} className={styles.form}>
                {/* Group A: Designer Identity */}
                <div className={styles.formSectionGroup}>
                  <h4 className={styles.formGroupTitle}>Designer Identity</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-name">Designer Name</label>
                      <input
                        id="designer-name"
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                        className={styles.input}
                        required
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-email">Email Address</label>
                      <input
                        id="designer-email"
                        type="email"
                        value={profileData.email}
                        className={styles.input}
                        readOnly
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-role">Primary Role</label>
                      <input
                        id="designer-role"
                        type="text"
                        value={profileData.role}
                        onChange={(e) => setProfileData({ ...profileData, role: e.target.value })}
                        className={styles.input}
                        required
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-location">Studio Location</label>
                      <input
                        id="designer-location"
                        type="text"
                        value={profileData.location}
                        onChange={(e) =>
                          setProfileData({ ...profileData, location: e.target.value })
                        }
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
                    <label htmlFor="designer-bio">Creative Bio</label>
                    <textarea
                      id="designer-bio"
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
                      <label htmlFor="designer-instagram">Instagram Handle</label>
                      <div className={styles.inputWithIconWrapper}>
                        <Instagram size={14} className={styles.fieldIcon} />
                        <input
                          id="designer-instagram"
                          type="text"
                          value={profileData.instagram}
                          onChange={(e) =>
                            setProfileData({ ...profileData, instagram: e.target.value })
                          }
                          placeholder="@duy.sneaker"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-behance">Behance Username</label>
                      <div className={styles.inputWithIconWrapper}>
                        <Globe size={14} className={styles.fieldIcon} />
                        <input
                          id="designer-behance"
                          type="text"
                          value={profileData.behance}
                          onChange={(e) =>
                            setProfileData({ ...profileData, behance: e.target.value })
                          }
                          placeholder="duynguyen"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-tiktok">TikTok Handle</label>
                      <div className={styles.inputWithIconWrapper}>
                        <Smartphone size={14} className={styles.fieldIcon} />
                        <input
                          id="designer-tiktok"
                          type="text"
                          value={profileData.tiktok}
                          onChange={(e) =>
                            setProfileData({ ...profileData, tiktok: e.target.value })
                          }
                          placeholder="@duy.hypebeast"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <button type="submit" className={styles.primaryBtn} disabled={saving}>
                    <Save size={14} />
                    <span>Save profile settings</span>
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {currentTab === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={styles.tabContent}
            >
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Security & Credentials</h2>
                <p className={styles.sectionSubtitle}>
                  Change password and adjust identity verification credentials.
                </p>
              </div>

              <div className={styles.twoColGrid}>
                {/* 2FA Panel */}
                <TwoFactorPanel />

                {/* Change Password Form */}
                <form onSubmit={handlePasswordSave} className={styles.passwordCard}>
                  <h3 className={styles.subFormTitle}>
                    <Key size={14} />
                    Update Password
                  </h3>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="current-password">Current Password</label>
                      <input
                        id="current-password"
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                        }
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="new-password">New Password</label>
                      <input
                        id="new-password"
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                        }
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="confirm-password">Confirm New Password</label>
                      <input
                        id="confirm-password"
                        type="password"
                        placeholder="••••••••"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                        }
                        className={styles.input}
                      />
                    </div>
                  </div>

                  <div>
                    <button type="submit" className={styles.primaryBtn} disabled={saving}>
                      <Save size={14} />
                      Update Password
                    </button>
                  </div>
                </form>

                <SessionsPanel />
                <ModerationStatusPanel />
              </div>
            </motion.div>
          )}

          {currentTab === 'privacy' && (
            <motion.div
              key="privacy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={styles.tabContent}
            >
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Privacy & Data</h2>
                <p className={styles.sectionSubtitle}>
                  Control who can see your work, what you consent to, and your personal data.
                </p>
              </div>

              <PrivacyPanel />
            </motion.div>
          )}

          {currentTab === 'appearance' && (
            <motion.div
              key="appearance"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={styles.tabContent}
            >
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Appearance</h2>
                <p className={styles.sectionSubtitle}>
                  Pick how the KusShoes workspace looks. The choice is remembered on this device.
                </p>
              </div>

              <div className={styles.appearanceGroup}>
                <h4 className={styles.formGroupTitle}>Theme Preferences</h4>

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
                      <span className={styles.themeCardDesc}>
                        Default neon-accented dark system
                      </span>
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
          )}
        </AnimatePresence>
      </div>

      {/* Interactive Avatar Picker Selector Modal (Dialog 5.15) */}
      {isAvatarModalOpen && (
        <div className={styles.modalBackdrop}>
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Choose Designer Avatar</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsAvatarModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <p className={styles.modalDesc}>
              Select one of the pre-designed presets or upload a custom image file.
            </p>

            {/* Presets Grid */}
            <div className={styles.avatarGrid}>
              {presetAvatars.map((preset) => (
                <div
                  key={preset.name}
                  className={`${styles.avatarGridItem} ${profileData.avatar === preset.url ? styles.avatarItemActive : ''}`}
                  onClick={() => handleSelectPresetAvatar(preset.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSelectPresetAvatar(preset.url);
                  }}
                >
                  <img src={preset.url} alt={preset.name} className={styles.gridAvatarImg} />
                  <span className={styles.gridAvatarName}>{preset.name}</span>
                </div>
              ))}
            </div>

            <div className={styles.divider} />

            {/* Custom avatar upload */}
            <div className={styles.uploadArea}>
              {uploadProgress ? (
                <div className={styles.uploadProgress}>
                  <RefreshCw className={styles.spinIcon} size={16} />
                  <span>Uploading mesh file avatar...</span>
                </div>
              ) : (
                <label
                  className={styles.secondaryBtn}
                  style={{ width: '100%', cursor: 'pointer' }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCustomUpload}
                    style={{ display: 'none' }}
                  />
                  <Upload size={14} />
                  <span>Upload custom photo (.png, .jpg)</span>
                </label>
              )}
            </div>

            {avatarPath && !uploadProgress && (
              <button
                type="button"
                className={styles.secondaryBtn}
                style={{ width: '100%' }}
                onClick={() => void handleRemoveAvatar()}
              >
                <X size={14} />
                <span>Remove current avatar</span>
              </button>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setIsAvatarModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
