import React from 'react';
import { Settings as SettingsIcon, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import shared from '../admin-shared.module.css';
import styles from './AdminSettings.module.css';

const LANGUAGES = ['en', 'vi'] as const;
type AdminLanguage = (typeof LANGUAGES)[number];

export const AdminSettings: React.FC = () => {
  const { t, i18n } = useTranslation('admin');
  const { theme, setTheme } = useTheme();
  const { session, isAdmin } = useAdminAuth();

  const currentLanguage: AdminLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'vi';

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>
            <SettingsIcon size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} />
            {t('settings.title')}
          </h1>
          <p className={shared.pageSubtitle}>{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings.languageTitle')}</h2>
        <p className={styles.cardDesc}>{t('settings.languageDesc')}</p>
        <div className={styles.optionGrid}>
          <div
            className={`${styles.optionCard} ${currentLanguage === 'en' ? styles.optionCardActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => void i18n.changeLanguage('en')}
            onKeyDown={(event) => event.key === 'Enter' && void i18n.changeLanguage('en')}
          >
            <span className={styles.optionTitle}>{t('settings.languageEnTitle')}</span>
            <span className={styles.optionDesc}>{t('settings.languageEnDesc')}</span>
          </div>
          <div
            className={`${styles.optionCard} ${currentLanguage === 'vi' ? styles.optionCardActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => void i18n.changeLanguage('vi')}
            onKeyDown={(event) => event.key === 'Enter' && void i18n.changeLanguage('vi')}
          >
            <span className={styles.optionTitle}>{t('settings.languageViTitle')}</span>
            <span className={styles.optionDesc}>{t('settings.languageViDesc')}</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings.themeTitle')}</h2>
        <p className={styles.cardDesc}>{t('settings.themeDesc')}</p>
        <div className={styles.optionGrid}>
          <div
            className={`${styles.optionCard} ${theme === 'dark' ? styles.optionCardActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setTheme('dark')}
            onKeyDown={(event) => event.key === 'Enter' && setTheme('dark')}
          >
            <span className={styles.optionTitle}>
              <Moon size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {t('sidebar.darkMode')}
            </span>
          </div>
          <div
            className={`${styles.optionCard} ${theme === 'light' ? styles.optionCardActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setTheme('light')}
            onKeyDown={(event) => event.key === 'Enter' && setTheme('light')}
          >
            <span className={styles.optionTitle}>
              <Sun size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {t('sidebar.lightMode')}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings.sessionTitle')}</h2>
        <div className={styles.sessionList}>
          <div className={styles.sessionRow}>
            <span className={styles.sessionKey}>{t('settings.sessionEmail')}</span>
            <span className={styles.sessionVal}>{session?.email ?? '—'}</span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionKey}>{t('settings.sessionRole')}</span>
            <span className={styles.sessionVal}>{isAdmin ? t('sidebar.roleAdmin') : t('sidebar.roleStaff')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
