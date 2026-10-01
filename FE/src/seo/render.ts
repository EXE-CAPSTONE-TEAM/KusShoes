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
        logo: `${SITE_URL}/KusShoes_Logo.png`,
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
        description:
          'KusShoes biến đôi giày thật thành mô hình 3D bằng điện thoại, lưu trên đám mây và tuỳ biến màu sắc, chất liệu, sticker trong studio thiết kế 3D KusStudio.',
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
    `<meta name="keywords" content="KusShoes, KusStudio, giày 3D, quét giày 3D, sneaker custom 3D, 3D photogrammetry, thiết kế sneaker" />`,
    `<meta name="author" content="KusShoes Team" />`,
    `<meta name="theme-color" content="#FF6B35" />`,
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
 * Rich semantic content placed inside #root. React replaces it on first render (it sits under
 * the boot overlay until then); crawlers that don't run JS get a complete, keyword-rich semantic
 * outline preventing thin-content penalties.
 */
export function renderFallback(page: SeoPage): string {
  const links = SEO_PAGES.map(
    (p) => `<li><a href="${p.path}">${escapeHtml(p.heading[LANG])}</a></li>`,
  ).join('');

  let specificSections = '';
  if (page.path === '/') {
    specificSections = [
      `<section>`,
      `<h2>Quy trình số hoá giày 3D và tuỳ biến thời trang</h2>`,
      `<article>`,
      `<h3>Bước 1: Quét giày bằng KusShoes Mobile</h3>`,
      `<p>Chụp ảnh giày 360 độ từ điện thoại thông minh với hướng dẫn góc chụp trực quan.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Bước 2: Dựng 3D Photogrammetry trên đám mây</h3>`,
      `<p>Hệ thống KIRI Engine tự động tạo lưới 3D, tính toán màu sắc và chất liệu chân thực.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Bước 3: Thiết kế trên KusStudio Desktop</h3>`,
      `<p>Tuỳ biến màu sắc, hoa văn, chất liệu và xuất mô hình 3D (.gltf, .obj, .fbx, .usdz).</p>`,
      `</article>`,
      `</section>`,
      `<section>`,
      `<h2>Hệ sinh thái KusShoes &amp; KusStudio</h2>`,
      `<ul>`,
      `<li>Ứng dụng di động KusShoes Mobile Scanner trên Android</li>`,
      `<li>Không gian sáng tạo KusStudio WebGL 3D thời gian thực</li>`,
      `<li>Lưu trữ đồng bộ đám mây và chia sẻ dự án tức thì</li>`,
      `</ul>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/products') {
    specificSections = [
      `<section>`,
      `<h2>Bộ công cụ KusShoes &amp; KusStudio</h2>`,
      `<article>`,
      `<h3>KusShoes Mobile Scanner</h3>`,
      `<p>Ứng dụng di động biến camera điện thoại thành máy quét 3D chuyên nghiệp cho giày sneaker và thời trang.</p>`,
      `</article>`,
      `<article>`,
      `<h3>KusStudio 3D Workspace</h3>`,
      `<p>Phần mềm thiết kế và tuỳ chỉnh 3D trên máy tính: đổi màu sắc, thử nghiệm vật liệu da, vải, cao su, thêm sticker và logo.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Định dạng xuất file chuẩn công nghiệp</h3>`,
      `<p>Hỗ trợ đầy đủ các định dạng 3D thông dụng: .gltf, .obj, .fbx, .usdz cho AR và game engine.</p>`,
      `</article>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/pricing') {
    specificSections = [
      `<section>`,
      `<h2>Các gói dịch vụ KusShoes</h2>`,
      `<article>`,
      `<h3>Gói Miễn Phí (Free)</h3>`,
      `<p>Bắt đầu quét và làm quen với công nghệ số hoá giày 3D với 3 lượt quét miễn phí.</p>`,
      `</article>`,
      `<article>`,
      `<h3>Gói Pro &amp; Creator</h3>`,
      `<p>Không giới hạn lượt quét, độ phân giải cao 4K texture, xuất định dạng không giới hạn và hỗ trợ ưu tiên.</p>`,
      `</article>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/privacy') {
    specificSections = [
      `<section>`,
      `<h2>Chính sách bảo mật KusShoes</h2>`,
      `<p>Cam kết bảo vệ dữ liệu cá nhân, hình ảnh quét 3D và tài khoản người dùng theo tiêu chuẩn an toàn bảo mật cao nhất.</p>`,
      `</section>`,
    ].join('');
  } else if (page.path === '/terms') {
    specificSections = [
      `<section>`,
      `<h2>Điều khoản sử dụng KusShoes &amp; KusStudio</h2>`,
      `<p>Quy định về quyền sở hữu trí tuệ mô hình 3D, điều khoản cấp phép phần mềm và trách nhiệm của người dùng dịch vụ.</p>`,
      `</section>`,
    ].join('');
  }

  return [
    `<main>`,
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
