// Fills the CSP script hashes into nginx-security-headers.conf for the Docker/nginx image.
//
// Usage: node scripts/render-nginx-csp.mjs <dist dir> <template> <output>
//
// Hashes every inline, executable <script> in the built HTML pages (the GTM/consent bootstrap
// and the theme script in index.html; their text depends on build-time env such as
// VITE_GTM_ID, so the hashes must be computed after `vite build`). JSON-LD blocks are data, not
// scripts, and need no hash.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PLACEHOLDER = '__CSP_SCRIPT_HASHES__';
const INLINE_SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;

export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, attrs = '', body] of html.matchAll(INLINE_SCRIPT)) {
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'module') continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

export function renderCsp(distDir, template) {
  if (template.split(PLACEHOLDER).length !== 2) {
    throw new Error(`template must contain ${PLACEHOLDER} exactly once`);
  }
  const hashes = new Set();
  for (const file of readdirSync(distDir).filter((name) => name.endsWith('.html'))) {
    for (const hash of inlineScriptHashes(readFileSync(path.join(distDir, file), 'utf8'))) {
      hashes.add(hash);
    }
  }
  if (hashes.size === 0) throw new Error(`no inline scripts found in ${distDir}/*.html`);
  return template.replace(PLACEHOLDER, [...hashes].sort().join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir, templatePath, outputPath] = process.argv.slice(2);
  if (!distDir || !templatePath || !outputPath) {
    console.error('usage: render-nginx-csp.mjs <dist dir> <template> <output>');
    process.exit(1);
  }
  writeFileSync(outputPath, renderCsp(distDir, readFileSync(templatePath, 'utf8')));
  console.log(`CSP script hashes written to ${outputPath}`);
}
