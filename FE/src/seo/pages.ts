// Single source of truth for what search engines see. Imported both by the app (runtime
// <title>/meta updates on client-side navigation) and by vite.config.ts (per-route HTML,
// sitemap.xml and robots.txt at build time), so keep it free of DOM and Node APIs.

/** Production origin. Canonical URLs always point here, so preview/alias hosts never compete. */
export const SITE_URL = 'https://kusshoes.kietta.me';
export const SITE_NAME = 'KusShoes';
/** 1200×630 social preview card (public/og-image.jpg). */
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

/** robots meta for public pages; everything else is `noindex` (see applyDocumentMeta). */
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large';
export const ROBOTS_NOINDEX = 'noindex, follow';

export type SeoLang = 'vi' | 'en';

type Localized = Record<SeoLang, string>;

export interface SeoPage {
  /** URL path the page is served at (no trailing slash, except the home page). */
  path: string;
  title: Localized;
  description: Localized;
  /** Short static text rendered into #root before the app boots (crawler fallback). */
  heading: Localized;
}

export const SEO_PAGES: readonly SeoPage[] = [
  {
    path: '/',
    title: {
      vi: 'KusShoes — Quét giày thật thành 3D, tuỳ biến sneaker trên KusStudio',
      en: 'KusShoes — Scan real sneakers into 3D and customise them in KusStudio',
    },
    description: {
      vi: 'KusShoes biến đôi giày thật thành mô hình 3D bằng điện thoại, lưu trên đám mây và tuỳ biến màu sắc, chất liệu, sticker trong studio thiết kế 3D KusStudio.',
      en: 'KusShoes turns real sneakers into 3D models with your phone, stores them in the cloud and lets you customise colours, materials and stickers in KusStudio.',
    },
    heading: {
      vi: 'KusShoes: Shape your shoes, show your style',
      en: 'KusShoes: Shape your shoes, show your style',
    },
  },
  {
    path: '/products',
    title: {
      vi: 'Sản phẩm — KusShoes App & KusStudio | KusShoes',
      en: 'Products — KusShoes App & KusStudio | KusShoes',
    },
    description: {
      vi: 'Quét giày bằng ứng dụng KusShoes trên điện thoại, KIRI Engine dựng mô hình 3D trên đám mây, rồi tuỳ biến, thêm sticker, chữ và xuất file 3D trong KusStudio.',
      en: 'Scan a sneaker with the KusShoes phone app, KIRI Engine builds the 3D model in the cloud, then add stickers and text and export 3D files in KusStudio.',
    },
    heading: {
      vi: 'Quét với KusShoes. Thiết kế trên KusStudio.',
      en: 'Scan with KusShoes. Design in KusStudio.',
    },
  },
  {
    path: '/pricing',
    title: {
      vi: 'Bảng giá — Gói miễn phí và trả phí | KusShoes',
      en: 'Pricing — Free and paid plans | KusShoes',
    },
    description: {
      vi: 'Bắt đầu quét giày 3D miễn phí, nâng cấp khi thư viện giày của bạn lớn dần. Đồng bộ liền mạch giữa KusShoes và KusStudio.',
      en: 'Start scanning sneakers in 3D for free, and upgrade as your shoe library grows. Sync seamlessly between KusShoes and KusStudio.',
    },
    heading: {
      vi: 'Gói linh hoạt cho mọi nhà sáng tạo',
      en: 'Flexible plans for every creator',
    },
  },
  {
    path: '/privacy',
    title: {
      vi: 'Chính sách bảo mật | KusShoes',
      en: 'Privacy Policy | KusShoes',
    },
    description: {
      vi: 'KusShoes thu thập dữ liệu gì khi bạn dùng trang web, ứng dụng Android và KusStudio Desktop, dùng vào việc gì, chia sẻ với ai, lưu bao lâu và quyền của bạn.',
      en: 'What KusShoes collects on the website, Android app and KusStudio Desktop, why, who we share it with, how long we keep it and your rights.',
    },
    heading: {
      vi: 'Chính sách bảo mật',
      en: 'Privacy Policy',
    },
  },
  {
    path: '/terms',
    title: {
      vi: 'Điều khoản dịch vụ | KusShoes',
      en: 'Terms of Service | KusShoes',
    },
    description: {
      vi: 'Điều khoản sử dụng trang web KusShoes, ứng dụng Android KusShoes và KusStudio Desktop.',
      en: 'The terms for using the KusShoes website, the KusShoes Android app and KusStudio Desktop.',
    },
    heading: {
      vi: 'Điều khoản dịch vụ',
      en: 'Terms of Service',
    },
  },
];

export const HOME_PAGE = SEO_PAGES[0];

/**
 * Paths crawlers must not fetch: the signed-in portal, admin, auth callbacks and payment
 * return URLs. They have no public content and only render a login redirect for a bot.
 */
export const PRIVATE_PATH_PREFIXES: readonly string[] = [
  '/admin',
  '/auth/',
  '/login',
  '/dashboard',
  '/projects',
  '/project-details',
  '/archives',
  '/trash',
  '/exports',
  '/billing',
  '/settings',
  '/feedback',
];

export function findSeoPage(pathname: string): SeoPage | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SEO_PAGES.find((page) => page.path === clean);
}

export const canonicalUrl = (page: SeoPage): string =>
  page.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${page.path}`;
