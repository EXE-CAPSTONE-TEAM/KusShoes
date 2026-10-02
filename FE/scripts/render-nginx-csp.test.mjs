// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes, renderCsp } from './render-nginx-csp.mjs';

const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

describe('render-nginx-csp', () => {
  it('hashes inline scripts only, not JSON-LD or external scripts', () => {
    const html = [
      '<script>\n  window.a = 1;\n</script>',
      '<script type="application/ld+json">{"@type":"Thing"}</script>',
      '<script type="module" crossorigin src="/assets/index.js"></script>',
      '<script type="module">import "/x.js";</script>',
    ].join('');
    expect([...inlineScriptHashes(html)]).toEqual([
      sha('\n  window.a = 1;\n'),
      sha('import "/x.js";'),
    ]);
  });

  it('fills the placeholder with the hashes of every built page', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'csp-'));
    writeFileSync(path.join(dist, 'index.html'), '<script>a()</script>');
    writeFileSync(path.join(dist, 'pricing.html'), '<script>a()</script><script>b()</script>');
    const out = renderCsp(dist, "script-src 'self' __CSP_SCRIPT_HASHES__ https://x;");
    expect(out).toBe(
      `script-src 'self' ${[sha('a()'), sha('b()')].sort((a, b) => a.localeCompare(b)).join(' ')} https://x;`,
    );
  });

  it('refuses a template without exactly one placeholder', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'csp-'));
    writeFileSync(path.join(dist, 'index.html'), '<script>a()</script>');
    expect(() => renderCsp(dist, 'no placeholder')).toThrow(/exactly once/);
  });

  it('keeps the nginx template usable', () => {
    const template = readFileSync(
      fileURLToPath(new URL('../nginx-security-headers.conf', import.meta.url)),
      'utf8',
    );
    expect(template.split('__CSP_SCRIPT_HASHES__')).toHaveLength(2);
    expect(template).toContain('https://www.googletagmanager.com');
    expect(template).not.toContain("'unsafe-inline' https://www.googletagmanager.com");
  });
});
