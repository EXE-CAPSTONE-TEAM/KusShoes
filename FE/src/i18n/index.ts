import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEn from './locales/en/common.json';
import commonVi from './locales/vi/common.json';
import landingEn from './locales/en/landing.json';
import landingVi from './locales/vi/landing.json';
import pricingEn from './locales/en/pricing.json';
import pricingVi from './locales/vi/pricing.json';
import productsEn from './locales/en/products.json';
import productsVi from './locales/vi/products.json';
import authEn from './locales/en/auth.json';
import authVi from './locales/vi/auth.json';
import artisanEn from './locales/en/artisan.json';
import artisanVi from './locales/vi/artisan.json';
import portalEn from './locales/en/portal.json';
import portalVi from './locales/vi/portal.json';

export const defaultNS = 'common';
export const LANGUAGE_STORAGE_KEY = 'kusshoes_lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        landing: landingEn,
        pricing: pricingEn,
        products: productsEn,
        auth: authEn,
        artisan: artisanEn,
        portal: portalEn,
      },
      vi: {
        common: commonVi,
        landing: landingVi,
        pricing: pricingVi,
        products: productsVi,
        auth: authVi,
        artisan: artisanVi,
        portal: portalVi,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    defaultNS,
    ns: ['common', 'landing', 'pricing', 'products', 'auth', 'artisan', 'portal'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
