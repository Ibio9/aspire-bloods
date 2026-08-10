import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY } from './theme';

/**
 * The theme bootstrap has to be three things at once, and each of them is a
 * thing it has already failed to be:
 *
 *  · Before the first paint — or dark-mode users get a full-page cream flash.
 *  · Not inline — or the portal's `script-src 'self'` CSP refuses to run it,
 *    which is what it was doing on every route in production.
 *  · Identical to the rules in this module — or the pre-paint theme and the
 *    theme React settles on disagree, and the page changes colour under the
 *    reader a moment after it loads.
 *
 * The first is a property of where the tag sits and is pinned by the route
 * smoke test (e2e/route-console.spec.ts). The other two are pinned here.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const indexHtml = readFileSync(`${root}index.html`, 'utf8');
const bootstrap = readFileSync(`${root}public/theme-bootstrap.js`, 'utf8');
/** Comments talk ABOUT script tags; only real markup counts as one. */
const markup = indexHtml.replace(/<!--[\s\S]*?-->/g, '');

describe('the pre-paint theme bootstrap', () => {
  it('is a file on this origin, not an inline script', () => {
    expect(markup).toContain('<script src="/theme-bootstrap.js"></script>');
    // Every script tag in the document must carry a src. An inline one is
    // blocked by the CSP, so it would not merely be untidy — it would not run.
    const inline = [...markup.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
    expect(inline, `index.html has ${inline.length} inline script tag(s)`).toHaveLength(0);
  });

  it('runs before the body, so the theme is applied before anything is painted', () => {
    const head = markup.indexOf('</head>');
    const tag = markup.indexOf('/theme-bootstrap.js');
    expect(tag).toBeGreaterThan(-1);
    expect(tag, 'the bootstrap must be inside <head> to beat the first paint').toBeLessThan(head);
    // Neither deferred nor a module: both of those wait for the parser, which
    // is the flash this exists to prevent.
    expect(markup).not.toMatch(/<script[^>]*theme-bootstrap\.js[^>]*\b(defer|async|type="module")/);
  });

  it('says exactly what this module says, so the two cannot drift', () => {
    // Whitespace-insensitive: the file carries a comment header, the constant
    // does not. What has to match is the code.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    expect(strip(bootstrap)).toBe(strip(THEME_BOOTSTRAP_SCRIPT));
  });

  it('reads the same storage key the app writes', () => {
    expect(bootstrap).toContain(`'${THEME_STORAGE_KEY}'`);
  });
});
