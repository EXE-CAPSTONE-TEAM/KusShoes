/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  getCookieConsent,
  onCookieConsentChange,
  saveCookieConsent,
} from './consent';

const consentUpdates = () =>
  (window.dataLayer ?? []).filter(
    (entry) => (entry as { event?: string }).event === 'consent_update',
  ) as { consent: Record<string, string> }[];

describe('cookie consent', () => {
  beforeEach(() => {
    localStorage.clear();
    window.dataLayer = [];
    delete (window as { gtag?: unknown }).gtag;
  });

  it('has no choice until the visitor decides', () => {
    expect(getCookieConsent()).toBeNull();
  });

  it('saves the choice, applies it to Consent Mode and notifies listeners', () => {
    const listener = vi.fn();
    const unsubscribe = onCookieConsentChange(listener);

    expect(saveCookieConsent({ analytics: true, ads: false })).toEqual({
      analytics: true,
      ads: false,
    });
    expect(getCookieConsent()).toEqual({ analytics: true, ads: false });
    expect(consentUpdates().pop()?.consent).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps the saved value of a category the new choice leaves out', () => {
    saveCookieConsent({ analytics: true, ads: true });
    expect(saveCookieConsent({ analytics: false })).toEqual({ analytics: false, ads: true });
  });

  it('asks again when the stored choice is from another version or unreadable', () => {
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: true, ads: true, version: COOKIE_CONSENT_VERSION + 1 }),
    );
    expect(getCookieConsent()).toBeNull();
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, '{oops');
    expect(getCookieConsent()).toBeNull();
  });

  it('matches the storage key, version and denied default of the index.html bootstrap', () => {
    const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain(`localStorage.getItem('${COOKIE_CONSENT_STORAGE_KEY}')`);
    expect(html).toContain(`saved.version === ${COOKIE_CONSENT_VERSION}`);
    expect(html).toContain("var analytics = 'denied', ads = 'denied';");
    expect(html).not.toMatch(/'analytics_storage': 'granted'/);
  });
});
