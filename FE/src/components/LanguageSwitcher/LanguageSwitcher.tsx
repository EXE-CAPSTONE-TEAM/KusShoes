import React from 'react';
import { useTranslation } from 'react-i18next';

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
      onClick={() => i18n.changeLanguage(next)}
      title={t('language.switchTo', { language: t(`language.${next}`) })}
      aria-label={t('language.switchTo', { language: t(`language.${next}`) })}
    >
      {current.toUpperCase()}
    </button>
  );
};
