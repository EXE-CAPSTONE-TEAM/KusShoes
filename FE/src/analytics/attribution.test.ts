import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_TOUCH_STORAGE_KEY,
  captureInitialAttribution,
  getStoredAttribution,
  parseAttribution,
} from './attribution';

describe('analytics / attribution', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('parseAttribution', () => {
    it('correctly parses standard UTM parameters', () => {
      const result = parseAttribution(
        'utm_source=facebook&utm_medium=cpc&utm_campaign=summer_sale&utm_content=shoe_ad',
        '/products',
        '',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('facebook');
      expect(result.utm_medium).toBe('cpc');
      expect(result.utm_campaign).toBe('summer_sale');
      expect(result.utm_content).toBe('shoe_ad');
      expect(result.landing_page).toBe('/products?utm_source=facebook&utm_medium=cpc&utm_campaign=summer_sale&utm_content=shoe_ad');
    });

    it('infers facebook source and cpc medium from fbclid when utm_source is missing', () => {
      const result = parseAttribution(
        'fbclid=IwAR3xQ9_sample_click_id',
        '/',
        '',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('facebook');
      expect(result.utm_medium).toBe('cpc');
      expect(result.fbclid).toBe('IwAR3xQ9_sample_click_id');
    });

    it('infers tiktok source and cpc medium from ttclid when utm_source is missing', () => {
      const result = parseAttribution(
        'ttclid=tt_click_12345',
        '/pricing',
        '',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('tiktok');
      expect(result.utm_medium).toBe('cpc');
      expect(result.ttclid).toBe('tt_click_12345');
    });

    it('infers google source and cpc medium from gclid when utm_source is missing', () => {
      const result = parseAttribution(
        'gclid=google_ad_click_999',
        '/',
        '',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('google');
      expect(result.utm_medium).toBe('cpc');
      expect(result.gclid).toBe('google_ad_click_999');
    });

    it('infers organic_social from Facebook referrer', () => {
      const result = parseAttribution(
        '',
        '/',
        'https://m.facebook.com/',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('facebook');
      expect(result.utm_medium).toBe('organic_social');
    });

    it('infers organic_social from TikTok referrer', () => {
      const result = parseAttribution(
        '',
        '/',
        'https://www.tiktok.com/@kusshoes',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('tiktok');
      expect(result.utm_medium).toBe('organic_social');
    });

    it('infers organic_search from Google search referrer', () => {
      const result = parseAttribution(
        '',
        '/',
        'https://www.google.com.vn/',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('google');
      expect(result.utm_medium).toBe('organic_search');
    });

    it('infers referral from external blog or news website', () => {
      const result = parseAttribution(
        '',
        '/',
        'https://kenh14.vn/gioi-tre-me-giay-kusshoes.html',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('kenh14.vn');
      expect(result.utm_medium).toBe('referral');
    });

    it('treats internal navigation within the same host as direct', () => {
      const result = parseAttribution(
        '',
        '/pricing',
        'https://kusshoes.com/products',
        'kusshoes.com',
      );

      expect(result.utm_source).toBe('direct');
      expect(result.utm_medium).toBe('direct');
    });

    it('defaults to direct when no params and no referrer', () => {
      const result = parseAttribution('', '/', '', 'kusshoes.com');

      expect(result.utm_source).toBe('direct');
      expect(result.utm_medium).toBe('direct');
    });
  });

  describe('captureInitialAttribution & getStoredAttribution', () => {
    it('captures and retrieves attribution from storage', () => {
      const captured = captureInitialAttribution();
      expect(captured).toBeDefined();

      const stored = getStoredAttribution();
      expect(stored).not.toBeNull();
      expect(stored?.utm_source).toBe(captured.utm_source);
    });

    it('preserves first-touch attribution when already stored', () => {
      const initialCampaign = {
        utm_source: 'tiktok',
        utm_medium: 'cpc',
        utm_campaign: 'first_touch_launch',
        initial_referrer: 'https://tiktok.com',
        landing_page: '/?utm_source=tiktok',
        captured_at: new Date().toISOString(),
      };
      localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(initialCampaign));

      const result = captureInitialAttribution();
      expect(result.utm_source).toBe('tiktok');
      expect(result.utm_campaign).toBe('first_touch_launch');

      const stored = getStoredAttribution();
      expect(stored?.utm_source).toBe('tiktok');
      expect(stored?.utm_campaign).toBe('first_touch_launch');
    });
  });
});
