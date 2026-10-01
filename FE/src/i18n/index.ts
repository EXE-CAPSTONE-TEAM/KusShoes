import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import type { BackendModule } from 'i18next';

// Namespaces the first screen of any page can need are bundled; the rest are fetched on first use
// (useTranslation suspends until they arrive), keeping the landing bundle small.
import commonEn from './locales/en/common.json';
import commonVi from './locales/vi/common.json';
import landingEn from './locales/en/landing.json';
import landingVi from './locales/vi/landing.json';
import pricingEn from './locales/en/pricing.json';
import pricingVi from './locales/vi/pricing.json';
// Used outside React (ErrorBoundary, utils/format.ts, utils/authValidation.ts) and by the
// always-mounted ImpersonationBanner, so it can't wait for a fetch.
import accountEn from './locales/en/account.json';
import accountVi from './locales/vi/account.json';

export const LAZY_NAMESPACES = [
  'products',
  'auth',
  'artisan',
  'portal',
  'billing',
  'projects',
  'details',
] as const;

const lazyResources = import.meta.glob<Record<string, unknown>>(
  './locales/*/{products,auth,artisan,portal,billing,projects,details}.json',
  { import: 'default' },
);

const lazyBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    const load = lazyResources[`./locales/${language}/${namespace}.json`];
    if (!load) {
      callback(null, {});
      return;
    }
    load().then(
      (data) => callback(null, data),
      (error: unknown) => callback(error as Error, false),
    );
  },
};

export const defaultNS = 'common';
export const LANGUAGE_STORAGE_KEY = 'kusshoes_lang';

// Awaited in main.tsx before the first render: without it, React can render one frame before
// i18next (and LanguageDetector's async detection) finishes, and any t(key, { returnObjects:
// true }) call during that window gets back the raw key string instead of the real value —
// e.g. Landing.tsx's FAQ list, where calling .map() on that string crashed the whole page.
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(lazyBackend)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        landing: landingEn,
        pricing: pricingEn,
        account: accountEn,
      },
      vi: {
        common: commonVi,
        landing: landingVi,
        pricing: pricingVi,
        account: accountVi,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    defaultNS,
    // Only the bundled namespaces load at init; LAZY_NAMESPACES come through lazyBackend.
    ns: ['common', 'landing', 'pricing', 'account'],
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
