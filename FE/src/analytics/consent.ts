/**
 * Cookie consent choice for this browser (Google Consent Mode v2).
 *
 * Until the visitor decides, every storage type stays `denied` (the default set in index.html,
 * which reads this same key before GTM loads). The choice lives in localStorage so it survives
 * reloads and also covers signed-out visitors; signed-in users can change it again in
 * Settings → Privacy.
 */
import { updateAnalyticsConsent } from './dataLayer';

/** Keep in sync with the inline consent bootstrap in index.html. */
export const COOKIE_CONSENT_STORAGE_KEY = 'kusshoes_cookie_consent';
/** Bump when the categories change, so everyone is asked again. */
export const COOKIE_CONSENT_VERSION = 1;

export interface CookieConsent {
  analytics: boolean;
  ads: boolean;
}

interface StoredCookieConsent extends CookieConsent {
  version: number;
  decided_at: string;
}

const CHANGE_EVENT = 'kusshoes:cookie-consent';
const OPEN_SETTINGS_EVENT = 'kusshoes:open-cookie-settings';

/** The visitor's saved choice, or null when they have not decided yet (or it is outdated). */
export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredCookieConsent>;
    if (stored.version !== COOKIE_CONSENT_VERSION) return null;
    return { analytics: stored.analytics === true, ads: stored.ads === true };
  } catch {
    return null;
  }
}

/**
 * Records a choice (missing categories keep their saved value, else `false`), applies it to
 * Consent Mode and tells any open banner that the visitor has decided.
 */
export function saveCookieConsent(choice: Partial<CookieConsent>): CookieConsent {
  const current = getCookieConsent();
  const consent: CookieConsent = {
    analytics: choice.analytics ?? current?.analytics ?? false,
    ads: choice.ads ?? current?.ads ?? false,
  };
  const stored: StoredCookieConsent = {
    ...consent,
    version: COOKIE_CONSENT_VERSION,
    decided_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked (private mode): the choice still applies to this page view.
  }
  updateAnalyticsConsent(consent);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  return consent;
}

/** Subscribes to choices made anywhere in the app (banner or Settings). */
export function onCookieConsentChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

/** Reopens the cookie banner with the category toggles (e.g. the footer's "Cookie settings"). */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

export function onOpenCookieSettings(listener: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}
