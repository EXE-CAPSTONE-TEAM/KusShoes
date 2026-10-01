import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { pushAnalyticsEvent } from './dataLayer';

/**
 * Custom hook to track SPA route transitions as page_view events in GTM and GA4.
 * Call this in App.tsx right after useDocumentMeta(activePage).
 */
export function useAnalyticsPageView(activePage: string): void {
  const { i18n } = useTranslation();
  const lastLocationRef = useRef<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentLocation = window.location.pathname + window.location.search;
    if (lastLocationRef.current === currentLocation) return;
    lastLocationRef.current = currentLocation;

    // Small delay ensures useDocumentMeta has already executed and set document.title
    const timer = window.setTimeout(() => {
      pushAnalyticsEvent('page_view', {
        page_title: document.title || 'KusShoes',
        page_location: window.location.href,
        page_path: window.location.pathname,
        page_language: i18n.resolvedLanguage || 'vi',
      });
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activePage, i18n.resolvedLanguage]);
}
