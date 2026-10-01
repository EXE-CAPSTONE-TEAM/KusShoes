// Makes the SPA crawlable: fills index.html's SEO blocks for the home page, writes one
// prerendered HTML shell per public route (own <title>, description, canonical, fallback text),
// and emits sitemap.xml + robots.txt. Page data lives in src/seo/pages.ts.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, Rollup } from 'vite';
import { HERO_IMAGE_SIZES, heroSrcSet } from './src/components/ShoeHeroExperience/heroImage.ts';
import { HOME_PAGE, SEO_PAGES } from './src/seo/pages.ts';
import {
  applySeo,
  htmlFileFor,
  renderRobots,
  renderSitemap,
  type HeadOptions,
} from './src/seo/render.ts';

/** Source of the home page's LCP image (ShoeHeroExperience's primary sneaker) + small variant. */
const LCP_IMAGE_SOURCE = 'src/assets/hero-sneaker-nobg.webp';
const LCP_IMAGE_SMALL_SOURCE = 'src/assets/hero-sneaker-nobg-640.webp';

function builtAssetUrl(bundle: Rollup.OutputBundle | undefined, source: string) {
  const file = bundle
    ? Object.values(bundle).find(
        (output) =>
          output.type === 'asset' && output.originalFileNames.some((name) => name.endsWith(source)),
      )
    : undefined;
  return file ? `/${file.fileName}` : undefined;
}

export function seoPlugin(options: HeadOptions = {}): Plugin {
  let outDir = 'dist';
  return {
    name: 'kusshoes-seo',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html, ctx) {
      // Preload the hero sneaker (the home page's LCP element) so the browser fetches it with
      // the document instead of waiting for the JS bundle to render the <img>.
      const lcpImage = builtAssetUrl(ctx.bundle, LCP_IMAGE_SOURCE);
      const lcpImageSmall = builtAssetUrl(ctx.bundle, LCP_IMAGE_SMALL_SOURCE);
      const responsive =
        lcpImage && lcpImageSmall
          ? { lcpImageSrcset: heroSrcSet(lcpImageSmall, lcpImage), lcpImageSizes: HERO_IMAGE_SIZES }
          : {};
      return applySeo(html, HOME_PAGE, { ...options, lcpImage, ...responsive });
    },
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(lastmod) });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobots() });
    },
    // index.html is only final (hashed asset tags injected) once written, so derive the
    // per-route shells from the file on disk.
    async writeBundle() {
      const indexHtml = await readFile(path.join(outDir, 'index.html'), 'utf8');
      await Promise.all(
        SEO_PAGES.filter((page) => page !== HOME_PAGE).map((page) =>
          writeFile(path.join(outDir, htmlFileFor(page)), applySeo(indexHtml, page, options)),
        ),
      );
    },
  };
}
