/**
 * Safe DataLayer engine for Google Tag Manager (GTM), Google Analytics 4 (GA4),
 * Meta (Facebook) Pixel, and TikTok Pixel.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsEventType =
  | 'page_view'
  | 'sign_up'
  | 'login'
  | 'view_item'
  | 'create_project'
  | 'begin_checkout'
  | 'purchase';

export interface PageViewPayload {
  page_title: string;
  page_location: string;
  page_path: string;
  page_language: string;
}

export interface SignUpPayload {
  method: 'google' | 'password';
  user_id?: string;
  utm_source?: string;
  utm_campaign?: string;
}

export interface LoginPayload {
  method: 'google' | 'password';
}

export interface ViewItemPayload {
  item_id: string;
  item_name: string;
  category?: string;
}

export interface CreateProjectPayload {
  project_id: string;
  project_name: string;
}

export interface BeginCheckoutPayload {
  plan_code: string;
  value: number;
  currency: string;
}

export interface PurchasePayload {
  transaction_id: string;
  value: number;
  currency: string;
  plan_code?: string;
}

export type AnalyticsPayloadMap = {
  page_view: PageViewPayload;
  sign_up: SignUpPayload;
  login: LoginPayload;
  view_item: ViewItemPayload;
  create_project: CreateProjectPayload;
  begin_checkout: BeginCheckoutPayload;
  purchase: PurchasePayload;
};

/**
 * Initializes dataLayer on window if not already present.
 */
export function ensureDataLayer(): Record<string, unknown>[] {
  if (typeof window === 'undefined') return [];
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

/**
 * Pushes a typed analytics event to window.dataLayer for GTM to distribute.
 */
export function pushAnalyticsEvent<T extends AnalyticsEventType>(
  eventName: T,
  payload: AnalyticsPayloadMap[T],
): void {
  if (typeof window === 'undefined') return;

  const dl = ensureDataLayer();
  const eventRecord: Record<string, unknown> = {
    event: eventName,
    ...payload,
    event_timestamp: new Date().toISOString(),
  };

  dl.push(eventRecord);

  if (import.meta.env.VITE_TRACKING_DEBUG === 'true') {
    // eslint-disable-next-line no-console
    console.log(`[Analytics Event: ${eventName}]`, eventRecord);
  }
}

/**
 * Updates Google Consent Mode v2 state based on user privacy preferences.
 * Integrates directly with KusShoes privacy controls (BR-15).
 */
export function updateAnalyticsConsent(consents: { analytics?: boolean; ads?: boolean }): void {
  if (typeof window === 'undefined') return;

  const analyticsGranted = consents.analytics ? 'granted' : 'denied';
  const adsGranted = consents.ads ? 'granted' : 'denied';

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: analyticsGranted,
      ad_storage: adsGranted,
      ad_user_data: adsGranted,
      ad_personalization: adsGranted,
    });
  } else {
    const dl = ensureDataLayer();
    dl.push({
      event: 'consent_update',
      consent: {
        analytics_storage: analyticsGranted,
        ad_storage: adsGranted,
        ad_user_data: adsGranted,
        ad_personalization: adsGranted,
      },
    });
  }
}
