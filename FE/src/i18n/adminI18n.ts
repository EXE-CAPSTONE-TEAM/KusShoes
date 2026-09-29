import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import adminEn from './locales/en/admin.json';
import adminVi from './locales/vi/admin.json';

export const ADMIN_LANGUAGE_STORAGE_KEY = 'kusshoes_admin_lang';

/**
 * A separate i18next instance for the Admin console, decoupled from the main site's `i18n`
 * (src/i18n/index.ts). The Admin UI has always shipped Vietnamese-only, so it defaults to `vi`
 * here — sharing the main instance (which defaults to `en`) would silently flip the admin
 * team's console to English the moment a customer-facing user switched their own language.
 */
const adminI18n = i18n.createInstance();

adminI18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { admin: adminEn },
      vi: { admin: adminVi },
    },
    fallbackLng: 'vi',
    supportedLngs: ['en', 'vi'],
    defaultNS: 'admin',
    ns: ['admin'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: ADMIN_LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default adminI18n;
