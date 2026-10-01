import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureDataLayer,
  pushAnalyticsEvent,
  updateAnalyticsConsent,
} from './dataLayer';

describe('analytics / dataLayer', () => {
  beforeEach(() => {
    window.dataLayer = [];
    delete (window as { gtag?: unknown }).gtag;
  });

  it('ensureDataLayer initializes window.dataLayer when empty', () => {
    delete (window as { dataLayer?: unknown }).dataLayer;
    const dl = ensureDataLayer();
    expect(Array.isArray(dl)).toBe(true);
    expect(window.dataLayer).toBe(dl);
  });

  it('pushAnalyticsEvent pushes formatted event to dataLayer', () => {
    pushAnalyticsEvent('page_view', {
      page_title: 'KusShoes Test',
      page_location: 'https://kusshoes.com/pricing',
      page_path: '/pricing',
      page_language: 'vi',
    });

    expect(window.dataLayer?.length).toBe(1);
    const event = window.dataLayer?.[0];
    expect(event?.event).toBe('page_view');
    expect(event?.page_title).toBe('KusShoes Test');
    expect(event?.page_path).toBe('/pricing');
    expect(typeof event?.event_timestamp).toBe('string');
  });

  it('pushAnalyticsEvent pushes sign_up event correctly', () => {
    pushAnalyticsEvent('sign_up', {
      method: 'google',
      utm_source: 'tiktok',
      utm_campaign: 'summer2026',
    });

    expect(window.dataLayer?.length).toBe(1);
    const event = window.dataLayer?.[0];
    expect(event?.event).toBe('sign_up');
    expect(event?.method).toBe('google');
    expect(event?.utm_source).toBe('tiktok');
  });

  it('updateAnalyticsConsent calls window.gtag when available', () => {
    const mockGtag = vi.fn();
    window.gtag = mockGtag;

    updateAnalyticsConsent({ analytics: true, ads: false });

    expect(mockGtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('updateAnalyticsConsent pushes consent_update event when window.gtag is missing', () => {
    updateAnalyticsConsent({ analytics: false, ads: false });

    expect(window.dataLayer?.length).toBe(1);
    const record = window.dataLayer?.[0];
    expect(record?.event).toBe('consent_update');
    expect(record?.consent).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });
});
