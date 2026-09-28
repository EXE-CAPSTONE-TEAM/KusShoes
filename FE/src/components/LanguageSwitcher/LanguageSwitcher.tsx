import React from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

const LANGUAGES = ['en', 'vi'] as const;
type SupportedLanguage = (typeof LANGUAGES)[number];

interface LanguageSwitcherProps {
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
  const { t, i18n } = useTranslation('common');
  const current: SupportedLanguage = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en';
  const next: SupportedLanguage = current === 'en' ? 'vi' : 'en';

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void i18n.changeLanguage(next);
        // Signed in: keep the profile's language (used for emails) in step. Best effort only.
        if (api.hasToken()) api.updateProfile({ language: next }).catch(() => undefined);
      }}
      title={t('language.switchTo', { language: t(`language.${next}`) })}
      aria-label={t('language.switchTo', { language: t(`language.${next}`) })}
    >
      {current.toUpperCase()}
    </button>
  );
};
