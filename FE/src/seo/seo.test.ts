/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  findSeoPage,
  HOME_PAGE,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  SEO_PAGES,
  SITE_URL,
} from './pages';
import {
  applySeo,
  htmlFileFor,
  renderFallback,
  renderHead,
  renderRobots,
  renderSitemap,
} from './render';
import { applyDocumentMeta } from './useDocumentMeta';

const template =
  '<html lang="vi"><head><!--seo:head--><!--/seo:head--></head>' +
  '<body><div id="root"><!--seo:body--><!--/seo:body--></div></body></html>';

describe('SEO pages', () => {
  it('have unique paths and non-empty copy in both languages', () => {
    expect(new Set(SEO_PAGES.map((p) => p.path)).size).toBe(SEO_PAGES.length);
    for (const page of SEO_PAGES) {
      for (const lang of ['vi', 'en'] as const) {
        expect(page.title[lang]).not.toBe('');
        expect(page.description[lang].length).toBeGreaterThan(50);
        expect(page.description[lang].length).toBeLessThanOrEqual(160);
      }
    }
  });

  it('finds pages with or without a trailing slash', () => {
    expect(findSeoPage('/pricing/')?.path).toBe('/pricing');
    expect(findSeoPage('/')).toBe(HOME_PAGE);
    expect(findSeoPage('/dashboard')).toBeUndefined();
  });

  it('canonicalises to the production origin', () => {
    expect(canonicalUrl(HOME_PAGE)).toBe(`${SITE_URL}/`);
    expect(canonicalUrl(findSeoPage('/pricing')!)).toBe(`${SITE_URL}/pricing`);
  });
});

describe('build renderers', () => {
  it('renders a page head with title, description, canonical and OG tags', () => {
    const pricing = findSeoPage('/pricing')!;
    const head = renderHead(pricing);
    expect(head).toContain(`<title>${pricing.title.vi}</title>`);
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/pricing" />`);
    expect(head).toContain('property="og:image"');
    expect(head).toContain('<meta property="og:image:width" content="1200" />');
    expect(head).not.toContain('name="keywords"');
    expect(head).toContain('name="theme-color"');
    expect(head).not.toContain('application/ld+json');
    expect(head).not.toContain('google-site-verification');
    expect(head).not.toContain('rel="preload"');
  });

  it('preloads the LCP image with high priority when given', () => {
    const head = renderHead(HOME_PAGE, { lcpImage: '/assets/hero-abc.webp' });
    expect(head).toContain(
      '<link rel="preload" as="image" href="/assets/hero-abc.webp" fetchpriority="high" />',
    );
  });

  it('publishes the landing FAQ as FAQPage structured data', () => {
    const head = renderHead(HOME_PAGE);
    const json = head.match(/<script type="application\/ld\+json">(.*)<\/script>/)![1];
    const graph: { '@type': string; mainEntity?: { name: string }[] }[] =
      JSON.parse(json)['@graph'];
    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    expect(faq?.mainEntity?.length).toBeGreaterThan(0);
    expect(faq?.mainEntity?.[0].name).toBe('KusShoes là gì và hoạt động thế nào?');
  });

  it('adds structured data only to the home page and verification only when given', () => {
    const head = renderHead(HOME_PAGE, { googleSiteVerification: 'abc"123' });
    expect(head).toContain('application/ld+json');
    expect(head).toContain('SoftwareApplication');
    expect(head).toContain('<meta name="google-site-verification" content="abc&quot;123" />');
  });

  it('fills both marker blocks and can refill an already-filled document', () => {
    const home = applySeo(template, HOME_PAGE);
    const products = applySeo(home, findSeoPage('/products')!);
    expect(products).toContain(`<link rel="canonical" href="${SITE_URL}/products" />`);
    expect(products).not.toContain(`href="${SITE_URL}/" />`);
    expect(products.match(/<title>/g)).toHaveLength(1);
    expect(products).toContain('<div id="root"><!--seo:body-->');
    expect(products).toContain('<h1>Quét với KusShoes. Thiết kế trên KusStudio.</h1>');
  });

  it('fails loudly when index.html lost its markers', () => {
    expect(() => applySeo('<html></html>', HOME_PAGE)).toThrow(/markers/);
  });

  it('links every public page from the fallback content', () => {
    const html = renderFallback(HOME_PAGE);
    for (const page of SEO_PAGES) expect(html).toContain(`href="${page.path}"`);
    expect(html).toContain('<h2>Quy trình số hoá giày 3D và tuỳ biến sneaker</h2>');
    expect(html).toContain('<h2>Câu hỏi thường gặp</h2>');
  });

  it('describes plans and export formats the way the app does', () => {
    const pricing = renderFallback(findSeoPage('/pricing')!);
    expect(pricing).toContain('Gói Free không bao gồm quét giày');
    expect(pricing).toContain('649.000đ/tháng');
    const products = renderFallback(findSeoPage('/products')!);
    expect(products).toContain('GLB và OBJ');
    for (const html of [pricing, products, renderFallback(HOME_PAGE)]) {
      expect(html).not.toMatch(/fbx|usdz/i);
    }
  });

  it('lists every public page in the sitemap with priority and changefreq', () => {
    const xml = renderSitemap('2026-09-29');
    for (const page of SEO_PAGES) expect(xml).toContain(`<loc>${canonicalUrl(page)}</loc>`);
    expect(xml).toContain('<lastmod>2026-09-29</lastmod>');
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
  });

  it('keeps crawlers out of private areas and points them at the sitemap', () => {
    const robots = renderRobots();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /dashboard');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    for (const page of SEO_PAGES) {
      expect(robots).not.toMatch(new RegExp(`^Disallow: ${page.path}$`, 'm'));
    }
  });
});

describe('hosting config', () => {
  it('rewrites every prerendered page to its own HTML file on Vercel', () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
    const rewrites: { source: string; destination: string }[] = vercel.rewrites;
    const catchAll = rewrites.findIndex((r) => r.source === '/(.*)');
    for (const page of SEO_PAGES.filter((p) => p !== HOME_PAGE)) {
      const index = rewrites.findIndex(
        (r) => r.source === page.path && r.destination === `/${htmlFileFor(page)}`,
      );
      expect(index, `missing rewrite for ${page.path}`).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(catchAll);
    }
  });
});

describe('applyDocumentMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = [
      '<meta name="description" content="" />',
      '<link rel="canonical" href="" />',
      '<meta property="og:url" content="" />',
      '<meta property="og:title" content="" />',
      '<meta name="robots" content="" />',
    ].join('');
  });

  it('applies the route meta in the visitor language', () => {
    applyDocumentMeta('/pricing', 'en');
    const pricing = findSeoPage('/pricing')!;
    expect(document.title).toBe(pricing.title.en);
    expect(document.documentElement.lang).toBe('en');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      pricing.description.en,
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_URL}/pricing`,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      ROBOTS_INDEX,
    );
  });

  it('marks unknown and private paths noindex so they are not soft 404s', () => {
    applyDocumentMeta('/does-not-exist', 'vi');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      ROBOTS_NOINDEX,
    );
  });

  it('falls back to the home page meta for private routes', () => {
    applyDocumentMeta('/dashboard', 'vi');
    expect(document.title).toBe(HOME_PAGE.title.vi);
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      `${SITE_URL}/`,
    );
  });
});
