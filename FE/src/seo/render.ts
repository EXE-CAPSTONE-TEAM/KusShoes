// Build-time HTML/XML renderers for the SEO pages (used by vite-plugin-seo.ts). Pure string
// functions so they can be unit-tested without a build.
import {
  canonicalUrl,
  HOME_PAGE,
  OG_IMAGE,
  PRIVATE_PATH_PREFIXES,
  SEO_PAGES,
  SITE_NAME,
  SITE_URL,
  type SeoPage,
} from './pages.ts';

/** Static HTML is Vietnamese (primary market); the app switches to the visitor's language. */
const LANG = 'vi';

export const HEAD_START = '<!--seo:head-->';
export const HEAD_END = '<!--/seo:head-->';
export const BODY_START = '<!--seo:body-->';
export const BODY_END = '<!--/seo:body-->';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function structuredData(): string {
  const organizationId = `${SITE_URL}/#organization`;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/KusShoes_Logo.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: ['vi', 'en'],
        publisher: { '@id': organizationId },
      },
    ],
  });
  // `<` can't appear raw inside a <script> block.
  return `<script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script>`;
}

export interface HeadOptions {
  /** Google Search Console HTML-tag verification token, if the site is verified that way. */
  googleSiteVerification?: string;
}

export function renderHead(page: SeoPage, options: HeadOptions = {}): string {
  const title = escapeHtml(page.title[LANG]);
  const description = escapeHtml(page.description[LANG]);
  const url = canonicalUrl(page);
  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="vi_VN" />`,
    `<meta property="og:locale:alternate" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];
  if (options.googleSiteVerification) {
    lines.push(
      `<meta name="google-site-verification" content="${escapeHtml(options.googleSiteVerification)}" />`,
    );
  }
  if (page === HOME_PAGE) lines.push(structuredData());
  return lines.map((line) => `  ${line}`).join('\n');
}

/**
 * Plain semantic content placed inside #root. React replaces it on first render (it sits under
 * the boot overlay until then); crawlers that don't run JS still get a heading, a description
 * and links to every public page.
 */
export function renderFallback(page: SeoPage): string {
  const links = SEO_PAGES.map(
    (p) => `<li><a href="${p.path}">${escapeHtml(p.heading[LANG])}</a></li>`,
  ).join('');
  return [
    `<main>`,
    `<h1>${escapeHtml(page.heading[LANG])}</h1>`,
    `<p>${escapeHtml(page.description[LANG])}</p>`,
    `<nav aria-label="KusShoes"><ul>${links}</ul></nav>`,
    `</main>`,
  ].join('');
}

function replaceBetween(html: string, start: string, end: string, content: string): string {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  if (from === -1 || to === -1)
    throw new Error(`SEO markers ${start} … ${end} missing from index.html`);
  return html.slice(0, from + start.length) + `\n${content}\n` + html.slice(to);
}

/** Fills (or refills) the SEO marker blocks of index.html for one page. */
export function applySeo(html: string, page: SeoPage, options: HeadOptions = {}): string {
  const withHead = replaceBetween(html, HEAD_START, HEAD_END, renderHead(page, options));
  return replaceBetween(withHead, BODY_START, BODY_END, renderFallback(page));
}

export function renderSitemap(lastmod: string): string {
  const urls = SEO_PAGES.map(
    (page) =>
      `  <url>\n    <loc>${canonicalUrl(page)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(): string {
  const disallow = PRIVATE_PATH_PREFIXES.map((prefix) => `Disallow: ${prefix}`).join('\n');
  return `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/** Output file for a page's prerendered HTML, relative to the build dir ("/pricing" → "pricing.html"). */
export const htmlFileFor = (page: SeoPage): string =>
  page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`;
