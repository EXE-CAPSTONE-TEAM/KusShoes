import React, { useEffect, useState } from 'react';
import { Smartphone, Save, Key, Instagram, Globe, X, Upload, RefreshCw, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('portal');
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const currentLanguage: 'en' | 'vi' = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en';

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
        toast(caught instanceof Error ? caught.message : t('settings.profile.toastLoadError'), 'error'),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast(t('settings.profile.toastSaved'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('settings.profile.toastSaveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast(t('settings.security.toastMismatch'), 'error');
      return;
    }
    setSaving(true);
    try {
      const message = await api.changePassword(passwordForm);
      toast(message || t('settings.security.toastUpdated'));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('settings.security.toastUpdateError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    setProfileData((prev) => ({ ...prev, avatar: url }));
    toast(t('settings.profile.toastPresetSelected'), 'info');
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
      toast(t('settings.profile.toastUploaded'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('settings.profile.toastUploadError'), 'error');
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
      toast(t('settings.profile.toastRemoved'));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('settings.profile.toastRemoveError'), 'error');
    } finally {
      setUploadProgress(false);
    }
  };

  const tabLabels: Record<SettingTab, string> = {
    profile: t('settings.tabs.profile'),
    security: t('settings.tabs.security'),
    privacy: t('settings.tabs.privacy'),
    appearance: t('settings.tabs.appearance'),
  };

  return (
    <div className={styles.container}>
      {/* Header Block conforming to DESIGN.md 6.1 */}
      <div className={styles.headerBlock}>
        {/* Row 1 · 56px: Title */}
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{t('settings.title')}</h1>
        </div>

        {/* Row 2 · 40px: Underline tabs (DESIGN.md 5.4) */}
        <nav className={styles.tabs} role="tablist" aria-label={t('settings.navLabel')}>
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
                <h2 className={styles.sectionTitle}>{t('settings.profile.title')}</h2>
                <p className={styles.sectionSubtitle}>{t('settings.profile.subtitle')}</p>
              </div>

              {/* Designer Avatar Preview & Actions */}
              <div className={styles.avatarSection}>
                <div className={styles.avatarPreviewWrapper}>
                  <img
                    src={profileData.avatar}
                    alt={profileData.name || t('settings.profile.avatarFallback')}
                    className={styles.avatarPreviewImg}
                  />
                </div>
                <div className={styles.avatarDetails}>
                  <span className={styles.avatarName}>{profileData.name || t('settings.profile.designerFallback')}</span>
                  <span className={styles.avatarEmail}>{profileData.email}</span>
                  <div className={styles.avatarActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setIsAvatarModalOpen(true)}
                    >
                      {t('settings.profile.changeAvatar')}
                    </button>
                    {avatarPath && (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => void handleRemoveAvatar()}
                        disabled={uploadProgress}
                      >
                        {t('settings.profile.removeAvatar')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Details Form */}
              <form onSubmit={handleProfileSave} className={styles.form}>
                {/* Group A: Designer Identity */}
                <div className={styles.formSectionGroup}>
                  <h4 className={styles.formGroupTitle}>{t('settings.profile.designerIdentity')}</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-name">{t('settings.profile.designerName')}</label>
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
                      <label htmlFor="designer-email">{t('settings.profile.emailAddress')}</label>
                      <input
                        id="designer-email"
                        type="email"
                        value={profileData.email}
                        className={styles.input}
                        readOnly
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-role">{t('settings.profile.primaryRole')}</label>
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
                      <label htmlFor="designer-location">{t('settings.profile.studioLocation')}</label>
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
                  <h4 className={styles.formGroupTitle}>{t('settings.profile.studioBio')}</h4>
                  <div className={styles.inputGroupFull}>
                    <label htmlFor="designer-bio">{t('settings.profile.creativeBio')}</label>
                    <textarea
                      id="designer-bio"
                      value={profileData.bio}
                      onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                      className={styles.textarea}
                      rows={4}
                      placeholder={t('settings.profile.bioPlaceholder')}
                      required
                    />
                  </div>
                </div>

                {/* Group C: Connected Portfolios */}
                <div className={styles.formSectionGroup}>
                  <h4 className={styles.formGroupTitle}>{t('settings.profile.connectedHandles')}</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="designer-instagram">{t('settings.profile.instagram')}</label>
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
                      <label htmlFor="designer-behance">{t('settings.profile.behance')}</label>
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
                      <label htmlFor="designer-tiktok">{t('settings.profile.tiktok')}</label>
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
                    <span>{t('settings.profile.saveProfile')}</span>
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
                <h2 className={styles.sectionTitle}>{t('settings.security.title')}</h2>
                <p className={styles.sectionSubtitle}>{t('settings.security.subtitle')}</p>
              </div>

              <div className={styles.twoColGrid}>
                {/* 2FA Panel */}
                <TwoFactorPanel />

                {/* Change Password Form */}
                <form onSubmit={handlePasswordSave} className={styles.passwordCard}>
                  <h3 className={styles.subFormTitle}>
                    <Key size={14} />
                    {t('settings.security.updatePassword')}
                  </h3>
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="current-password">{t('settings.security.currentPassword')}</label>
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
                      <label htmlFor="new-password">{t('settings.security.newPassword')}</label>
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
                      <label htmlFor="confirm-password">{t('settings.security.confirmPassword')}</label>
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
                      {t('settings.security.updatePassword')}
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
                <h2 className={styles.sectionTitle}>{t('settings.privacy.title')}</h2>
                <p className={styles.sectionSubtitle}>{t('settings.privacy.subtitle')}</p>
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
                <h2 className={styles.sectionTitle}>{t('settings.appearance.title')}</h2>
                <p className={styles.sectionSubtitle}>{t('settings.appearance.subtitle')}</p>
              </div>

              <div className={styles.appearanceGroup}>
                <h4 className={styles.formGroupTitle}>{t('settings.appearance.themePreferences')}</h4>

                <div className={styles.themeSelectorGrid}>
                  {/* Dark Theme Card */}
                  <div
                    className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
                    onClick={() => {
                      setTheme('dark');
                      toast(t('settings.appearance.toastDark'));
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
                      <span className={styles.themeCardTitle}>{t('settings.appearance.darkTitle')}</span>
                      <span className={styles.themeCardDesc}>{t('settings.appearance.darkDesc')}</span>
                    </div>
                  </div>

                  {/* Light Theme Card */}
                  <div
                    className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
                    onClick={() => {
                      setTheme('light');
                      toast(t('settings.appearance.toastLight'));
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
                      <span className={styles.themeCardTitle}>{t('settings.appearance.lightTitle')}</span>
                      <span className={styles.themeCardDesc}>{t('settings.appearance.lightDesc')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.appearanceGroup}>
                <h4 className={styles.formGroupTitle}>{t('settings.appearance.languageTitle')}</h4>
                <p className={styles.sectionSubtitle} style={{ marginTop: -8 }}>
                  {t('settings.appearance.languageDesc')}
                </p>

                <div className={styles.themeSelectorGrid}>
                  <div
                    className={`${styles.themeCard} ${currentLanguage === 'en' ? styles.themeCardActive : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void i18n.changeLanguage('en');
                      toast(t('settings.appearance.toastLanguageChanged'));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void i18n.changeLanguage('en');
                        toast(t('settings.appearance.toastLanguageChanged'));
                      }
                    }}
                  >
                    <div className={styles.themeCardMeta}>
                      <span className={styles.themeCardTitle}>
                        <Languages size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        {t('settings.appearance.languageEnTitle')}
                      </span>
                      <span className={styles.themeCardDesc}>{t('settings.appearance.languageEnDesc')}</span>
                    </div>
                  </div>

                  <div
                    className={`${styles.themeCard} ${currentLanguage === 'vi' ? styles.themeCardActive : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void i18n.changeLanguage('vi');
                      toast(t('settings.appearance.toastLanguageChanged'));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void i18n.changeLanguage('vi');
                        toast(t('settings.appearance.toastLanguageChanged'));
                      }
                    }}
                  >
                    <div className={styles.themeCardMeta}>
                      <span className={styles.themeCardTitle}>
                        <Languages size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        {t('settings.appearance.languageViTitle')}
                      </span>
                      <span className={styles.themeCardDesc}>{t('settings.appearance.languageViDesc')}</span>
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
              <h3 className={styles.modalTitle}>{t('settings.avatarModal.title')}</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsAvatarModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <p className={styles.modalDesc}>{t('settings.avatarModal.desc')}</p>

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
                  <span>{t('settings.avatarModal.uploading')}</span>
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
                  <span>{t('settings.avatarModal.uploadCta')}</span>
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
                <span>{t('settings.avatarModal.removeCurrent')}</span>
              </button>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setIsAvatarModalOpen(false)}
              >
                {t('settings.avatarModal.cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
