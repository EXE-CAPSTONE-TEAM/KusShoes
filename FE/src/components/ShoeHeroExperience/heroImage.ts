// Shared by ShoeHeroExperience's <img sizes> and the build-time preload of the home page's LCP
// image (vite-plugin-seo.ts), which must request the same srcset candidate as the <img>.
// Phones: the sneaker renders at ~85% of the viewport width; desktop caps it at 680px.
export const HERO_IMAGE_SIZES = '(max-width: 900px) 85vw, 680px';

export const heroSrcSet = (small: string, large: string) => `${small} 640w, ${large} 900w`;
