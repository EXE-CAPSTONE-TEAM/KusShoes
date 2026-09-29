// Makes the SPA crawlable: fills index.html's SEO blocks for the home page, writes one
// prerendered HTML shell per public route (own <title>, description, canonical, fallback text),
// and emits sitemap.xml + robots.txt. Page data lives in src/seo/pages.ts.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { HOME_PAGE, SEO_PAGES } from './src/seo/pages.ts';
import {
  applySeo,
  htmlFileFor,
  renderRobots,
  renderSitemap,
  type HeadOptions,
} from './src/seo/render.ts';

export function seoPlugin(options: HeadOptions = {}): Plugin {
  let outDir = 'dist';
  return {
    name: 'kusshoes-seo',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return applySeo(html, HOME_PAGE, options);
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
