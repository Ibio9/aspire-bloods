import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * THE SHOTS FOR THIS ROUND, plus the two things that have to be MEASURED rather
 * than reviewed.
 *
 * Same conventions as the other `zz-` walks: runs last, writes files, asserts
 * almost nothing, and is skipped unless `E2E_SCREENSHOTS=1`. What it adds over
 * zz-screenshots.spec.ts is the set of surfaces this round actually changed —
 * the marker page's new hierarchy, the explanation card's labels, the three
 * band fills side by side, the results-ready moment, an empty state and the
 * second surface register — and the two measurements:
 *
 *  · THE THREE LABELS in the explanation card, read off the rendered element.
 *    "The sub-labels are bigger than the heading" is a claim about computed
 *    style and has now been wrong three times when eyeballed.
 *  · THE THREE BAND FILLS, read from the live custom properties rather than
 *    from the token file, so the swatch is the colour the browser paints.
 */

const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots');

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

type Theme = 'light' | 'dark';
const WIDTHS = [
  { key: '', width: 1440, height: 900 },
  { key: '-mobile', width: 390, height: 844 },
] as const;
type Width = (typeof WIDTHS)[number];

async function signIn(request: APIRequestContext, email: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

async function themedContext(browser: Browser, theme: Theme, size: Width = WIDTHS[0]) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.width < 768,
    hasTouch: size.width < 768,
    deviceScaleFactor: size.width < 768 ? 2 : 1,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a locked-down browser is not this spec's problem */
    }
  }, theme);
  return ctx;
}

function shoot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  return page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? false });
}

/** The first marker on the by-marker view — a real result with a real trend. */
async function openFirstMarker(page: Page): Promise<void> {
  await page.goto('/results?view=by-marker');
  const first = page.locator('a[href^="/markers/"]').first();
  await first.waitFor({ timeout: 30_000 });
  const href = await first.getAttribute('href');
  await page.goto(href!);
  await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
  // The chart's own mount animation is 700ms; the stagger is under 600ms.
  await page.waitForTimeout(1400);
}

test.describe(RUN ? 'this round’s shots' : 'this round’s shots (skipped — set E2E_SCREENSHOTS=1)', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1');
  test.setTimeout(300_000);

  test('the marker page, the explanation card, and the three labels measured', async ({ browser }) => {
    for (const theme of ['light', 'dark'] as Theme[]) {
      for (const size of WIDTHS) {
        const ctx = await themedContext(browser, theme, size);
        await signIn(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
        const page = await ctx.newPage();
        await openFirstMarker(page);

        await shoot(page, `marker-page-${theme}${size.key}`, { fullPage: true });
        await page.locator('.recharts-wrapper').first().screenshot({
          path: path.join(OUT, `trend-chart-${theme}${size.key}.png`),
        });
        const card = page.locator('.card-vellum').first();
        if (await card.count()) {
          await card.scrollIntoViewIfNeeded();
          await card.screenshot({ path: path.join(OUT, `explanation-card-${theme}${size.key}.png`) });
        }

        if (size.width === 1440) {
          const read = async (sel: string) => {
            const el = page.locator(sel).first();
            if (!(await el.count())) return null;
            return el.evaluate((n) => {
              const cs = getComputedStyle(n);
              return {
                text: (n.textContent ?? '').trim().slice(0, 32),
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                letterSpacing: cs.letterSpacing,
                textTransform: cs.textTransform,
                color: cs.color,
                marginBottom: cs.marginBottom,
                marginTop: cs.marginTop,
              };
            });
          };
          // eslint-disable-next-line no-console
          console.log(`\n=== EXPLANATION CARD LABELS · ${theme.toUpperCase()} ===`);
          // eslint-disable-next-line no-console
          console.log('heading  .card-eyebrow', JSON.stringify(await read('.card-eyebrow')));
          // eslint-disable-next-line no-console
          console.log('label    .sublabel    ', JSON.stringify(await read('.sublabel')));
          // eslint-disable-next-line no-console
          console.log('section  .eyebrow     ', JSON.stringify(await read('.eyebrow')));

          // And the other inversion this round fixed: the marker NAME against
          // the VALUE. The name used to be the biggest thing on the page.
          const size1 = async (sel: string) =>
            page.locator(sel).first().evaluate((n) => getComputedStyle(n).fontSize);
          // eslint-disable-next-line no-console
          console.log('h1 name      ', await size1('h1'));
          // eslint-disable-next-line no-console
          console.log('hero value   ', await size1('.hero-value, .hero-value-text'));
        }
        await ctx.close();
      }
    }
  });

  test('the three bands, side by side, in both themes', async ({ browser }) => {
    for (const theme of ['light', 'dark'] as Theme[]) {
      const ctx = await themedContext(browser, theme, { key: '', width: 1000, height: 560 });
      await signIn(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
      const page = await ctx.newPage();
      await page.goto('/overview');
      await page.waitForLoadState('networkidle');

      /**
       * Read the LIVE custom properties and draw the five fills on both of the
       * surfaces a band is actually painted on — the chart's plot panel and the
       * card a range bar sits on. Off the document rather than out of the token
       * file, so what is photographed is what the browser paints.
       */
      const measured = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const v = (n: string) => `rgb(${cs.getPropertyValue(n).trim()})`;
        const hues = ['green', 'olive', 'yellow', 'orange', 'red'] as const;
        const fills = Object.fromEntries(hues.map((h) => [h, v(`--c-hue-${h}-fill`)]));
        const plot = v('--c-chart-plot-surface');
        const card = v('--c-cream-50');
        const line = v('--c-chart-line');
        const el = document.createElement('div');
        el.setAttribute('data-band-swatch', '');
        el.style.cssText = `position:fixed;inset:0;z-index:9999;background:${v('--c-cream')};display:flex;flex-direction:column;gap:26px;padding:34px;font-family:var(--font-body)`;
        const row = (surface: string, label: string) => `
          <div>
            <div style="font:500 12px/1.5 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:${v('--c-espresso')};opacity:.8;margin-bottom:10px">${label}</div>
            <div style="display:flex;background:${surface};border:1px solid ${v('--c-taupe')};border-radius:16px;overflow:hidden">
              ${hues
                .map(
                  (h) => `<div style="flex:1;height:120px;background:${fills[h]};display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px">
                    <span style="font:600 11px/1 var(--font-mono);color:${v('--c-espresso')};background:${surface};padding:3px 6px;border-radius:6px">${h} ${fills[h]}</span>
                  </div>`,
                )
                .join('')}
            </div>
          </div>`;
        el.innerHTML = `
          <div style="font:400 28px/1.2 var(--font-display);color:${v('--c-espresso')}">Band fills — the three states and the two hinges</div>
          ${row(plot, 'On the chart plot panel')}
          ${row(card, 'On a card, where a range bar sits')}
          <div style="display:flex;align-items:center;gap:10px;font:400 14px/1.5 var(--font-body);color:${v('--c-espresso')}">
            <span style="display:block;width:64px;height:3px;border-radius:2px;background:${line}"></span>
            the trend line, over all of them
          </div>`;
        document.body.appendChild(el);
        return { fills, plot, card, line };
      });
      // eslint-disable-next-line no-console
      console.log(`\n=== BAND FILLS · ${theme.toUpperCase()} ===\n${JSON.stringify(measured, null, 1)}`);
      await shoot(page, `bands-${theme}`);
      await ctx.close();
    }
  });

  test('an empty state, and the second surface register', async ({ browser }) => {
    // An EMPTY STATE with the arch behind it, and the second surface register.
    for (const theme of ['light', 'dark'] as Theme[]) {
      for (const size of WIDTHS) {
        const ctx = await themedContext(browser, theme, size);
        await signIn(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
        const page = await ctx.newPage();

        // "No marker matches that" — a real empty state a reader reaches.
        await page.goto('/library');
        const search = page.getByLabel('Find a marker');
        await search.waitFor({ timeout: 30_000 });
        await search.fill('zzzzzzzz');
        await page.getByText('No marker matches that').waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(page, `empty-state-${theme}${size.key}`);

        // The second surface register: an opened explanation in the library.
        await search.fill('ferritin');
        const row = page.getByRole('button', { name: /^Ferritin/ }).first();
        await row.waitFor({ timeout: 15_000 });
        await row.click();
        await page.locator('.card-vellum').first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(page, `vellum-library-${theme}${size.key}`, { fullPage: false });
        await ctx.close();
      }
    }
  });
});
