import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  canonicalUrl,
  findSeoPage,
  HOME_PAGE,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  type SeoLang,
} from './pages';

function setAttr(selector: string, attr: string, value: string) {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

/**
 * Applies a route's <title>, description and canonical URL (from src/seo/pages.ts) in the
 * visitor's language. The build already ships the right tags per public route; this keeps
 * them correct after client-side navigation and language switches. Routes without an SEO
 * entry (portal, admin) fall back to the home page's tags and are marked `noindex`: the host
 * serves the app shell (HTTP 200) for any URL, so an unknown path would otherwise be indexed as
 * a duplicate of the home page (a "soft 404").
 */
export function applyDocumentMeta(pathname: string, lang: SeoLang): void {
  const seoPage = findSeoPage(pathname);
  const page = seoPage ?? HOME_PAGE;
  const title = page.title[lang];
  const description = page.description[lang];
  const url = canonicalUrl(page);

  document.documentElement.lang = lang;
  document.title = title;
  setAttr('meta[name="description"]', 'content', description);
  setAttr('meta[name="robots"]', 'content', seoPage ? ROBOTS_INDEX : ROBOTS_NOINDEX);
  setAttr('link[rel="canonical"]', 'href', url);
  setAttr('meta[property="og:url"]', 'content', url);
  setAttr('meta[property="og:title"]', 'content', title);
  setAttr('meta[property="og:description"]', 'content', description);
  setAttr('meta[name="twitter:title"]', 'content', title);
  setAttr('meta[name="twitter:description"]', 'content', description);
}

/** Re-applies the document meta whenever the active page or the UI language changes. */
export function useDocumentMeta(activePage: string): void {
  const { i18n } = useTranslation();
  const lang: SeoLang = i18n.resolvedLanguage?.startsWith('vi') ? 'vi' : 'en';

  useEffect(() => {
    applyDocumentMeta(window.location.pathname, lang);
  }, [activePage, lang]);
}
