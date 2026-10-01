// Build-time HTML/XML renderers for the SEO pages (used by vite-plugin-seo.ts). Pure string
// functions so they can be unit-tested without a build.
import {
  canonicalUrl,
  HOME_PAGE,
  OG_IMAGE,
  PRIVATE_PATH_PREFIXES,
  ROBOTS_INDEX,
  SEO_PAGES,
  SITE_NAME,
  SITE_URL,
  type SeoPage,
} from './pages.ts';
import landingVi from '../i18n/locales/vi/landing.json' with { type: 'json' };

/** Static HTML is Vietnamese (primary market); the app switches to the visitor's language. */
const LANG = 'vi';

export const HEAD_START = '<!--seo:head-->';
export const HEAD_END = '<!--/seo:head-->';
export const BODY_START = '<!--seo:body-->';
export const BODY_END = '<!--/seo:body-->';

/** The landing page FAQ (same copy the app renders), reused for the FAQPage schema and fallback. */
const FAQ: readonly { q: string; a: string }[] = landingVi.faqSection.items;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function structuredData(): string {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const softwareId = `${SITE_URL}/#software`;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/KusShoes_Logo.png`,
          width: 512,
          height: 512,
        },
        sameAs: ['https://github.com/EXE-CAPSTONE-TEAM/KusShoes'],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: ['vi', 'en'],
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': softwareId,
        name: SITE_NAME,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web, Android, Windows, macOS',
        url: `${SITE_URL}/`,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'VND',
        },
        publisher: { '@id': organizationId },
        description: HOME_PAGE.description[LANG],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        inLanguage: LANG,
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  });
  // `<` can't appear raw inside a <script> block.
  return `<script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script>`;
}

export interface HeadOptions {
  /** Google Search Console HTML-tag verification token, if the site is verified that way. */
  googleSiteVerification?: string;
  /** Built URL of the page's LCP image, preloaded with high priority (home page only). */
  lcpImage?: string;
}

export function renderHead(page: SeoPage, options: HeadOptions = {}): string {
  const title = escapeHtml(page.title[LANG]);
  const description = escapeHtml(page.description[LANG]);
  const url = canonicalUrl(page);
  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="author" content="KusShoes Team" />`,
    `<meta name="theme-color" content="#FF6B35" />`,
    `<meta name="robots" content="${ROBOTS_INDEX}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="vi_VN" />`,
    `<meta property="og:locale:alternate" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(HOME_PAGE.title[LANG])}" />`,
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
  if (options.lcpImage) {
    lines.push(
      `<link rel="preload" as="image" href="${escapeHtml(options.lcpImage)}" fetchpriority="high" />`,
    );
  }
  if (page === HOME_PAGE) lines.push(structuredData());
  return lines.map((line) => `  ${line}`).join('\n');
}

/**
 * Rich semantic content placed inside #root. React replaces it on first render (it sits under
 * the boot overlay until then); crawlers that don't run JS get a complete, keyword-rich semantic
 * outline preventing thin-content penalties.
 */
export function renderFallback(page: SeoPage): string {
  const links = SEO_PAGES.map(
    (p) => `<li><a href="${p.path}">${escapeHtml(p.heading[LANG])}</a></li>`,
  ).join('');

  // Keep this copy factually in line with what the app renders (plans, export formats): search
  // engines compare the prerendered text with the rendered page.
  let specificSections = '';
  if (page.path === '/') {
    const faq = FAQ.map(
      (item) => `<article><h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p></article>`,
    ).join('');
    specificSections = [
      `<section>`,
      `<h2>Quy trình số hoá giày 3D và tuỳ biến sneaker</h2>`,
      `<article>`,
      `<h3>Bước 1: Quét giày bằng ứng dụng KusShoes</h3>`,
      `<p>Quay video 360° đôi giày bằng điện thoại Android với khung hướng dẫn góc quay trực quan.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Bước 2: Dựng mô hình 3D trên đám mây</h3>`,
      `<p>KIRI Engine dựng mô hình 3D photogrammetry từ video quét, giữ lại màu sắc và chất liệu thật của đôi giày.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Bước 3: Thiết kế trên KusStudio</h3>`,
      `<p>Tuỳ biến màu sắc, chất liệu, thêm sticker và chữ trên KusStudio (web và desktop), rồi xuất file 3D GLB/OBJ kèm ảnh render và bản tham khảo PDF cho nghệ nhân.</p>`,
      `</article>`,
      `</section>`,
      `<section>`,
      `<h2>Hệ sinh thái KusShoes &amp; KusStudio</h2>`,
      `<ul>`,
      `<li>Ứng dụng quét giày KusShoes trên Android</li>`,
      `<li>Studio thiết kế 3D KusStudio trên web và máy tính</li>`,
      `<li>Thư viện giày lưu trên đám mây, đồng bộ giữa các thiết bị</li>`,
      `</ul>`,
      `</section>`,
      `<section>`,
      `<h2>Câu hỏi thường gặp</h2>`,
      faq,
      `</section>`,
    ].join('');
  } else if (page.path === '/products') {
    specificSections = [
      `<section>`,
      `<h2>Bộ công cụ KusShoes &amp; KusStudio</h2>`,
      `<article>`,
      `<h3>Ứng dụng KusShoes</h3>`,
      `<p>Ứng dụng Android biến camera điện thoại thành máy quét 3D cho giày sneaker: quay một vòng 360°, phần còn lại do đám mây xử lý.</p>`,
      `</article>`,
      `<article>`,
      `<h3>KusStudio</h3>`,
      `<p>Studio thiết kế 3D trên web và máy tính: đổi màu, thử chất liệu da, vải, cao su, thêm sticker, logo và chữ ngay trên mô hình giày.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Xuất file 3D</h3>`,
      `<p>Xuất mô hình 3D định dạng GLB và OBJ, ảnh render chất lượng cao và bản tham khảo PDF ghi mã màu, kích thước, vị trí sticker.</p>`,
      `</article>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/pricing') {
    specificSections = [
      `<section>`,
      `<h2>Các gói dịch vụ KusShoes</h2>`,
      `<article>`,
      `<h3>Free — 0đ</h3>`,
      `<p>Thiết kế trên 3 mẫu giày có sẵn, xuất ảnh PNG có watermark. Gói Free không bao gồm quét giày.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Basic — 259.000đ/tháng</h3>`,
      `<p>1 lượt quét mỗi chu kỳ, xuất GLB texture 2K, 100 lượt xuất và toàn bộ thư viện mẫu giày.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Pro — 649.000đ/tháng</h3>`,
      `<p>Nhiều lượt quét hơn, xuất GLB và OBJ texture 4K, không watermark. Mua thêm lượt quét lẻ 49.000đ/lượt khi đang dùng Basic/Pro.</p>`,
      `</article>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/privacy') {
    specificSections = [
      `<section>`,
      `<h2>Chính sách bảo mật KusShoes</h2>`,
      `<p>Dữ liệu KusShoes thu thập trên trang web, ứng dụng Android và KusStudio Desktop, mục đích sử dụng, thời gian lưu trữ và quyền của bạn đối với dữ liệu cá nhân và ảnh quét giày.</p>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/terms') {
    specificSections = [
      `<section>`,
      `<h2>Điều khoản sử dụng KusShoes &amp; KusStudio</h2>`,
      `<p>Quy định về tài khoản, gói dịch vụ, quyền sở hữu mô hình 3D và thiết kế, cùng trách nhiệm của người dùng khi sử dụng KusShoes và KusStudio.</p>`,
      `</section>`,
    ].join('');
  }

  return [
    `<main class="seo-fallback">`,
    `<header>`,
    `<h1>${escapeHtml(page.heading[LANG])}</h1>`,
    `<p>${escapeHtml(page.description[LANG])}</p>`,
    `</header>`,
    specificSections,
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
  const urls = SEO_PAGES.map((page) => {
    const priority =
      page === HOME_PAGE
        ? '1.0'
        : page.path === '/products' || page.path === '/pricing'
          ? '0.8'
          : '0.5';
    const changefreq =
      page === HOME_PAGE
        ? 'daily'
        : page.path === '/products' || page.path === '/pricing'
          ? 'weekly'
          : 'monthly';
    return `  <url>\n    <loc>${canonicalUrl(page)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(): string {
  const disallow = PRIVATE_PATH_PREFIXES.map((prefix) => `Disallow: ${prefix}`).join('\n');
  return `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/** Output file for a page's prerendered HTML, relative to the build dir ("/pricing" → "pricing.html"). */
export const htmlFileFor = (page: SeoPage): string =>
  page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`;
