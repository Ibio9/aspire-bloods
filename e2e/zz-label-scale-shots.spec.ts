import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ===========================================================================
 *  THE LABEL SCALE, AND THE MARKER PAGE'S TWO CARDS.
 * ===========================================================================
 *
 * Every eyebrow in the product went from 12px to 21px and the card heading
 * from 16px to 28px (Aug 2026) — a label goes above the text it labels in both
 * senses now. That is a change nothing can be usefully asserted about: "is the
 * label the stronger element" is a question about a rendered page, and the only
 * honest answer to it is a picture of one.
 *
 * WHAT IT PHOTOGRAPHS, and the list is chosen rather than swept: the marker
 * page whole, then ONE CROP OF EACH KIND OF CARD in the product, so the
 * label/content relationship can be judged card by card rather than at page
 * scale. Both themes, plus the two places a wider label was most likely to
 * break — a 288px sidebar and a 390px phone.
 *
 * THE MARKER PAGE IS ALSO MEASURED HERE, because two of its properties are
 * facts rather than opinions: the two cards are the same height, and the pair
 * fits a 1440×900 window with the page header still visible. Both are printed
 * and both are asserted — the second is the constraint the two-card layout was
 * restored under, and a card that grows by one line breaks it silently.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`.
 */
const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots/labels');
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

async function themed(browser: Browser, theme: 'light' | 'dark', width = 1440, height = 900) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: width < 768 ? 2 : 1,
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
 * IntersectionObserver — and a fullPage screenshot does not scroll, so a
 * section that has never been in view photographs BLANK.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
}

async function shotOf(page: Page, selector: string, file: string) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await el.screenshot({ path: path.join(OUT, file) });
}

test.describe('the label scale', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 360_000 });

  for (const theme of ['dark', 'light'] as const) {
    test(`the marker page and one card of each kind — ${theme}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const ctx = await themed(browser, theme);
      await login(ctx.request);
      const page = await ctx.newPage();

      const overview = (await (await ctx.request.get('/api/patient/overview')).json()) as {
        attention: { markerId: string; name: string }[];
        latest: { reportId: string } | null;
      };
      // An out-of-range marker deliberately: it is the only state that renders
      // every card this page has, the out-of-range prompt included.
      const marker = overview.attention[0];

      // ── THE MARKER PAGE ──────────────────────────────────────────────────
      await page.goto(`/markers/${marker.markerId}`);
      await expect(page.getByRole('heading', { name: marker.name })).toBeVisible({ timeout: 20_000 });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `marker-viewport-${theme}.png`) });
      await page.screenshot({ path: path.join(OUT, `marker-full-${theme}.png`), fullPage: true });

      // THE PAIR FITS ONE WINDOW, AND THE TWO CARDS ARE THE SAME HEIGHT.
      const fit = await page.evaluate(() => {
        const [left, right] = [...document.querySelectorAll('.card')].slice(0, 2).map((c) => c.getBoundingClientRect());
        const h1 = document.querySelector('h1')!.getBoundingClientRect();
        return {
          viewport: window.innerHeight,
          headingTop: Math.round(h1.top),
          left: { w: Math.round(left.width), h: Math.round(left.height) },
          right: { w: Math.round(right.width), h: Math.round(right.height) },
          rowBottom: Math.round(Math.max(left.bottom, right.bottom)),
        };
      });
      const span = fit.left.w + fit.right.w;
      console.log(
        `  marker/${theme}: header at ${fit.headingTop} · cards ${fit.left.w}x${fit.left.h} + ${fit.right.w}x${fit.right.h}` +
          ` (${Math.round((fit.left.w / span) * 100)}/${Math.round((fit.right.w / span) * 100)})` +
          ` · row ends at ${fit.rowBottom} of ${fit.viewport}`,
      );
      expect(fit.left.h, 'the two cards are not the same height').toBe(fit.right.h);
      expect(fit.headingTop, 'the page header is off the top of the window').toBeGreaterThanOrEqual(0);
      expect(fit.rowBottom, 'the pair does not fit a 1440x900 window with the header visible').toBeLessThanOrEqual(
        fit.viewport,
      );

      // ── ONE CARD OF EACH KIND ────────────────────────────────────────────
      // The marker page carries four of them on its own.
      await shotOf(page, '.grid > .card', `card-latest-result-${theme}.png`);
      await shotOf(page, '.grid > .card + .card', `card-trend-${theme}.png`);
      await shotOf(page, '.card-vellum', `card-explanation-${theme}.png`);
      await shotOf(page, '.max-w-3xl > .card:not(.card-vellum)', `card-out-of-range-${theme}.png`);

      // ── THE OVERVIEW: the at-a-glance pairs, a result card, a change card ─
      await page.goto('/overview');
      await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
        timeout: 20_000,
      });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `overview-viewport-${theme}.png`) });
      await shotOf(page, 'header dl', `stats-strip-${theme}.png`);
      await shotOf(page, '#worth-a-conversation li .card', `card-attention-${theme}.png`);
      await shotOf(page, '#recent-panel .card', `card-recent-panel-${theme}.png`);
      await shotOf(page, '#go-deeper .card', `card-go-deeper-${theme}.png`);
      await shotOf(page, '#whats-changed .card', `card-change-${theme}.png`);

      // ── A REPORT: the at-a-glance strip, the section index, the controls ──
      if (overview.latest) {
        await page.goto(`/reports/${overview.latest.reportId}`);
        await page.waitForTimeout(2500);
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `report-viewport-${theme}.png`) });
      }

      // ── THE SIDEBAR: the same labels at 288px, where they are chrome ─────
      await page.goto('/overview');
      await settle(page);
      const contact = page.getByRole('button', { name: /Contact the clinic/i }).first();
      if (await contact.count()) {
        await contact.click().catch(() => undefined);
        await page.waitForTimeout(500);
      }
      await shotOf(page, 'aside', `sidebar-${theme}.png`);

      await ctx.close();
    });
  }

  test('the marker page and the labels on a phone', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const ctx = await themed(browser, 'dark', 390, 844);
    await login(ctx.request);
    const page = await ctx.newPage();
    const overview = (await (await ctx.request.get('/api/patient/overview')).json()) as {
      attention: { markerId: string; name: string }[];
    };
    await page.goto(`/markers/${overview.attention[0].markerId}`);
    await expect(page.getByRole('heading', { name: overview.attention[0].name })).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, 'marker-phone-dark.png'), fullPage: true });
    await page.goto('/overview');
    await settle(page);
    await page.screenshot({ path: path.join(OUT, 'overview-phone-dark.png') });
    await ctx.close();
  });
});
