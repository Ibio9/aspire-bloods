import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ===========================================================================
 *  THE CARDS, AT THE WIDTHS WHERE THEY GO WRONG.
 * ===========================================================================
 *
 * Three faults were all the same fault — a card too narrow for what was put in
 * it — and all three are only visible on a rendered page at a real width:
 *
 *  · a marker's name broken MID-WORD across three lines on a result card;
 *  · a row of three "What's changed" cards, each too narrow, each stretched to
 *    the tallest of them so the short ones ended in half a card of nothing;
 *  · a stat strip whose labels wrapped and out-shouted the figures under them.
 *
 * `marker-name-wrapping.spec.ts` asserts the two that are geometry. This writes
 * the pictures for the third, which is a judgement, plus the pictures that show
 * the first two are gone.
 *
 * WHAT IT PHOTOGRAPHS: the marker page, a row of result cards CHOSEN FOR THE
 * LONGEST NAMES this patient has, the most-recent-panel stats, the What's
 * changed row and the sidebar — both themes, desktop and phone. The long names
 * are found from the patient's own data rather than staged, because the whole
 * question is what the real catalogue does in a real column.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`.
 */
const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots/cards');
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

const SIZES = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'phone', width: 390, height: 844 },
] as const;

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

async function themed(browser: Browser, theme: 'light' | 'dark', size: (typeof SIZES)[number]) {
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

/**
 * WALK THE PAGE BEFORE CAPTURING IT. Everything below the fold is wrapped in
 * `Reveal`, which starts at `opacity: 0` and is lifted by an
 * IntersectionObserver — and a screenshot does not scroll, so a section that
 * has never been in view photographs BLANK.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

async function shotOf(page: Page, selector: string, file: string) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: path.join(OUT, file) });
}

test.describe('card layout', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 480_000 });

  for (const size of SIZES) {
    for (const theme of ['dark', 'light'] as const) {
      test(`the marker page, result cards, stats, changes and the sidebar — ${theme}, ${size.key}`, async ({
        browser,
      }) => {
        fs.mkdirSync(OUT, { recursive: true });
        const suffix = `${theme}-${size.key}`;
        const ctx = await themed(browser, theme, size);
        await login(ctx.request);
        const page = await ctx.newPage();

        const overview = (await (await ctx.request.get('/api/patient/overview')).json()) as {
          attention: { markerId: string; name: string }[];
        };
        const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
          markerId: string;
          name: string;
        }[];
        // The longest name this patient actually has — the one the mid-word
        // break happened to.
        const longest = [...markers].sort((a, b) => b.name.length - a.name.length)[0];

        // ── THE MARKER PAGE, on an out-of-range marker so every card renders ─
        const marker = overview.attention[0];
        await page.goto(`/markers/${marker.markerId}`);
        await expect(page.getByRole('heading', { name: marker.name })).toBeVisible({ timeout: 30_000 });
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `marker-${suffix}.png`) });
        await page.screenshot({ path: path.join(OUT, `marker-full-${suffix}.png`), fullPage: true });
        await shotOf(page, '.card-vellum', `card-explanation-${suffix}.png`);

        // The same page for the longest-named marker, where the h1 has to wrap.
        await page.goto(`/markers/${longest.markerId}`);
        await expect(page.getByRole('heading', { name: longest.name })).toBeVisible({ timeout: 30_000 });
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `marker-longest-name-${suffix}.png`) });
        console.log(`  ${suffix}: longest marker name "${longest.name}" (${longest.name.length} characters)`);

        // ── A ROW OF RESULT CARDS, SEARCHED DOWN TO THE LONGEST NAMES ───────
        // "Anti" pulls in Anti-Thyroid Peroxidase Antibody (Anti-TPO) and its
        // neighbours; the fallback is the unfiltered grid, which is still the
        // real one.
        await page.goto('/results?view=by-marker');
        await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(2500);
        const search = page.getByRole('searchbox').or(page.getByPlaceholder(/Find a marker/i)).first();
        if (await search.count()) {
          await search.fill('an');
          await page.waitForTimeout(800);
        }
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `result-cards-long-names-${suffix}.png`) });

        // ── THE OVERVIEW: the stats strip and the What's changed row ────────
        await page.goto('/overview');
        await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
          timeout: 30_000,
        });
        await settle(page);
        await shotOf(page, '#recent-panel .card', `stats-recent-panel-${suffix}.png`);
        await shotOf(page, '#whats-changed', `whats-changed-${suffix}.png`);
        await page.screenshot({ path: path.join(OUT, `overview-${suffix}.png`) });

        // ── THE SIDEBAR, contact card open ─────────────────────────────────
        if (size.width >= 768) {
          const contact = page.getByRole('button', { name: /Contact the clinic/i }).first();
          if (await contact.count()) {
            await contact.click().catch(() => undefined);
            await page.waitForTimeout(500);
          }
          await shotOf(page, 'aside', `sidebar-${suffix}.png`);
        } else {
          // On a phone the sidebar is a drawer behind the menu button.
          const menu = page.getByRole('button', { name: /Open navigation menu/i }).first();
          if (await menu.count()) {
            await menu.click().catch(() => undefined);
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(OUT, `sidebar-${suffix}.png`) });
          }
        }

        await ctx.close();
      });
    }
  }
});
