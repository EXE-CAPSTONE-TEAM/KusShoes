/**
 * First-Touch Customer Acquisition & Attribution Engine.
 * Extracts marketing parameters (UTM, Facebook fbclid, TikTok ttclid, Google gclid, Referrer)
 * and persists them for registration and conversion tracking.
 */

export interface AttributionData {
  utm_source: string;
  utm_medium: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  initial_referrer: string;
  landing_page: string;
  captured_at: string;
}

export const FIRST_TOUCH_STORAGE_KEY = 'kusshoes_first_touch_attribution';
export const SESSION_ATTRIBUTION_KEY = 'kusshoes_session_attribution';
const ATTRIBUTION_MAX_AGE_DAYS = 30;

function inferSourceFromReferrer(referrer: string, currentHost: string): { source: string; medium: string } {
  if (!referrer) {
    return { source: 'direct', medium: 'direct' };
  }

  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();

    // Internal navigation within the same site is not a new external referral
    if (host === currentHost.toLowerCase()) {
      return { source: 'direct', medium: 'direct' };
    }

    // Social networks
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) {
      return { source: 'facebook', medium: 'organic_social' };
    }
    if (host.includes('instagram.com')) {
      return { source: 'instagram', medium: 'organic_social' };
    }
    if (host.includes('tiktok.com')) {
      return { source: 'tiktok', medium: 'organic_social' };
    }
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return { source: 'youtube', medium: 'organic_social' };
    }
    if (host.includes('twitter.com') || host.includes('x.com') || host.includes('t.co')) {
      return { source: 'twitter', medium: 'organic_social' };
    }
    if (host.includes('threads.net')) {
      return { source: 'threads', medium: 'organic_social' };
    }

    // Search engines
    if (host.includes('google.')) {
      return { source: 'google', medium: 'organic_search' };
    }
    if (host.includes('bing.com')) {
      return { source: 'bing', medium: 'organic_search' };
    }
    if (host.includes('duckduckgo.com')) {
      return { source: 'duckduckgo', medium: 'organic_search' };
    }
    if (host.includes('yahoo.com')) {
      return { source: 'yahoo', medium: 'organic_search' };
    }
    if (host.includes('coccoc.com')) {
      return { source: 'coccoc', medium: 'organic_search' };
    }

    // Chat / Direct messaging apps
    if (host.includes('zalo.me') || host.includes('chat.zalo.me')) {
      return { source: 'zalo', medium: 'referral' };
    }
    if (host.includes('t.me') || host.includes('telegram.org')) {
      return { source: 'telegram', medium: 'referral' };
    }

    return { source: host, medium: 'referral' };
  } catch {
    return { source: 'direct', medium: 'direct' };
  }
}

/**
 * Parses search params and referrer to construct an AttributionData object.
 */
export function parseAttribution(
  searchQuery: string,
  pathname: string,
  referrer: string,
  currentHost: string,
): AttributionData {
  const params = new URLSearchParams(searchQuery);

  const utm_source = params.get('utm_source')?.trim();
  const utm_medium = params.get('utm_medium')?.trim();
  const utm_campaign = params.get('utm_campaign')?.trim() || undefined;
  const utm_term = params.get('utm_term')?.trim() || undefined;
  const utm_content = params.get('utm_content')?.trim() || undefined;

  const fbclid = params.get('fbclid')?.trim() || undefined;
  const ttclid = params.get('ttclid')?.trim() || undefined;
  const gclid = params.get('gclid')?.trim() || undefined;

  let source = utm_source;
  let medium = utm_medium;

  // If UTMs are missing, infer from paid click IDs
  if (!source) {
    if (fbclid) {
      source = 'facebook';
      medium = medium || 'cpc';
    } else if (ttclid) {
      source = 'tiktok';
      medium = medium || 'cpc';
    } else if (gclid) {
      source = 'google';
      medium = medium || 'cpc';
    }
  }

  // If still missing, infer from HTTP Referrer
  if (!source) {
    const inferred = inferSourceFromReferrer(referrer, currentHost);
    source = inferred.source;
    medium = medium || inferred.medium;
  }

  return {
    utm_source: source || 'direct',
    utm_medium: medium || 'direct',
    utm_campaign,
    utm_term,
    utm_content,
    fbclid,
    ttclid,
    gclid,
    initial_referrer: referrer || '',
    landing_page: pathname + (searchQuery ? `?${searchQuery}` : ''),
    captured_at: new Date().toISOString(),
  };
}

/**
 * Checks if the stored attribution is still valid (within 30 days).
 */
function isAttributionFresh(attribution: AttributionData): boolean {
  if (!attribution.captured_at) return false;
  const capturedDate = new Date(attribution.captured_at).getTime();
  if (isNaN(capturedDate)) return false;
  const ageInMs = Date.now() - capturedDate;
  const maxAgeMs = ATTRIBUTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageInMs <= maxAgeMs;
}

/**
 * Captures attribution on initial page landing, preserving first-touch attribution
 * while updating session attribution.
 */
export function captureInitialAttribution(): AttributionData {
  if (typeof window === 'undefined') {
    return {
      utm_source: 'direct',
      utm_medium: 'direct',
      initial_referrer: '',
      landing_page: '/',
      captured_at: new Date().toISOString(),
    };
  }

  const currentAttribution = parseAttribution(
    window.location.search,
    window.location.pathname,
    document.referrer,
    window.location.hostname,
  );

  // Always update current session storage
  try {
    sessionStorage.setItem(SESSION_ATTRIBUTION_KEY, JSON.stringify(currentAttribution));
  } catch {
    // Ignore storage quota or security errors
  }

  // Check existing first-touch attribution
  try {
    const existingRaw = localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as AttributionData;
      if (isAttributionFresh(existing)) {
        // If the existing one is not direct, or the new one is also direct, keep existing first-touch
        if (existing.utm_source !== 'direct' || currentAttribution.utm_source === 'direct') {
          return existing;
        }
      }
    }

    // Persist new first-touch attribution
    localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(currentAttribution));
  } catch {
    // Ignore storage quota or security errors
  }

  return currentAttribution;
}

/**
 * Retrieves the stored first-touch attribution for customer registration or checkout.
 */
export function getStoredAttribution(): AttributionData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(FIRST_TOUCH_STORAGE_KEY) || sessionStorage.getItem(SESSION_ATTRIBUTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AttributionData;
  } catch {
    return null;
  }
}
