import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * ===========================================================================
 *  THIS ROUND'S SHOTS — THE ARC GAUGE, THE PANES AND THE TWO GLOWS.
 * ===========================================================================
 *
 * Five screens at two widths in two themes, plus three close-ups of the things
 * that are new and that a full-page shot is too small to settle:
 *
 *   · THE GAUGE AT BOTH SIZES, cropped, side by side — the 240px one on a
 *     marker page and the 148px one on a result card. The card version drops
 *     the two reference-bound LABELS and keeps their hairlines, which is the
 *     one judgement call in the redraw and the one thing worth looking at.
 *   · THE PANES AGAINST EACH GLOW. A pane in the corner the warm key light is
 *     in, and a pane in the corner the cool fill is in, so the material can be
 *     seen doing the thing it is for: transmitting two different lights.
 *   · THE FULL PAGE AT BOTH CORNERS, so the two sources read as two sources
 *     rather than as one wide wash — which is the failure the original pair of
 *     viewport-sized radials had and the reason the falloff is what it is.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`, same as every other shot walk
 * in here: these write files and are not assertions.
 */

const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.join(process.cwd(), 'screenshots');
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

const SIZES = [
  { key: '', width: 1440, height: 900 },
  { key: '-mobile', width: 390, height: 844 },
] as const;

async function signIn(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  expect(login.ok(), 'the demo account could not sign in').toBeTruthy();
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

async function themed(browser: Browser, theme: 'light' | 'dark', size: (typeof SIZES)[number]) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a private window with no storage is not a reason to fail */
    }
  }, theme);
  await signIn(ctx.request);
  return ctx;
}

/**
 * Every `.reveal` on the page starts at `opacity: 0` and is lifted by an
 * IntersectionObserver. A screenshot does not scroll, so anything below the
 * fold has never intersected and photographs BLANK — which reads exactly like a
 * broken layout and is not one. Walk the page first, then come back.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  // The reveal transition, the gauge's own sweep round the arc, and a beat.
  await page.waitForTimeout(1000);
}

/** A marker with history, so the left card carries a gauge and the right one a line. */
async function markerWithHistory(request: APIRequestContext): Promise<string> {
  const markers = (await (await request.get('/api/patient/markers')).json()) as {
    markerId: string;
    resultType?: string;
    resultCount: number;
  }[];
  const withHistory = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2);
  expect(withHistory.length, 'no marker has more than one result — run the demo seed').toBeGreaterThan(0);
  return withHistory[0].markerId;
}

test.describe('the arc gauge, the panes and the two glows', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 360_000 });

  for (const size of SIZES) {
    test(`the five screens, both themes${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themed(browser, theme, size);
        const page = await ctx.newPage();
        const markerId = await markerWithHistory(ctx.request);

        const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
          reportId: string;
          patientStatus: string;
          markerCount?: number;
        }[];
        const released = reports
          .filter((r) => r.patientStatus === 'RELEASED')
          .sort((a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0))[0];

        const screens: { name: string; url: string }[] = [
          { name: 'overview', url: '/overview' },
          { name: 'results', url: '/results?view=by-marker' },
          { name: 'marker', url: `/markers/${markerId}` },
          { name: 'documents', url: '/documents' },
        ];
        if (released) screens.push({ name: 'report', url: `/reports/${released.reportId}` });

        for (const screen of screens) {
          await page.goto(screen.url);
          await page.waitForLoadState('networkidle');
          await settle(page);
          await page.screenshot({
            path: path.join(OUT, `arc-${screen.name}-${theme}${size.key}.png`),
            fullPage: false,
          });
        }
        await ctx.close();
      }
    });
  }

  /**
   * THE GAUGE, CROPPED, AT BOTH SIZES.
   *
   * A full-page shot at 2× is still only ~240 device pixels of gauge on a marker
   * page and ~148 on a card, which is not enough to see whether the boundary
   * hairlines landed on the right stretch of arc or whether the mark is inside
   * its ring. Cropped to the element with a margin, it is.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`the gauge at both sizes, cropped — ${theme}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const ctx = await themed(browser, theme, SIZES[0]);
      const page = await ctx.newPage();

      // The full instrument: 240px, four figures, the optimal narrowing where a
      // marker has one, and the value and status word in the middle.
      await page.goto(`/markers/${await markerWithHistory(ctx.request)}`);
      await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1200);
      const full = page.locator('.arc-gauge').first();
      await full.screenshot({ path: path.join(OUT, `arc-gauge-full-${theme}.png`) });
      // And the card it sits on, so the gauge can be judged against the space
      // around it rather than in isolation.
      await page.locator('.card').first().screenshot({ path: path.join(OUT, `arc-gauge-card-${theme}.png`) });

      // The card instrument: 148px, two figures, no bound labels, no sweep.
      await page.goto('/results?view=by-marker');
      await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await page.locator('.arc-gauge').first().screenshot({ path: path.join(OUT, `arc-gauge-mini-${theme}.png`) });

      /**
       * A ROW OF THEM, which is the view the mini gauge actually has to survive.
       * One gauge can be judged on its own merits; four across a grid is where a
       * repeating instrument either reads as a system or reads as noise, and it
       * is the reason the specular streak is refused on these cards.
       */
      const grid = page.locator('a[href^="/markers/"]').first().locator('xpath=ancestor::*[contains(@class,"grid")][1]');
      await grid.screenshot({ path: path.join(OUT, `arc-gauge-row-${theme}.png`) });

      await ctx.close();
    });
  }

  /**
   * THE PANES AGAINST BOTH GLOWS.
   *
   * The two sources are anchored at opposite corners and are 2.25 radii apart,
   * so no pixel carries both — which means the only way to see the material
   * transmitting each of them is to photograph each corner. Scrolled to the top
   * for the warm key at the top right, and to the bottom for the cool fill at
   * the bottom left.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`the panes against each glow — ${theme}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const ctx = await themed(browser, theme, SIZES[0]);
      const page = await ctx.newPage();
      await page.goto('/overview');
      await page.waitForLoadState('networkidle');
      await settle(page);

      // The key light's corner.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `glow-key-corner-${theme}.png`) });

      // The fill light's corner. The page has to be at its foot for the
      // bottom-left of the viewport to be the bottom-left of the document.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `glow-fill-corner-${theme}.png`) });

      // A pane on its own, cropped, so the streak and the lit edge are visible
      // at a size somebody can actually look at.
      const pane = page.locator('.glass-panel').first();
      if (await pane.count()) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await pane.screenshot({ path: path.join(OUT, `glass-pane-${theme}.png`) });
      }

      // And the explanation card, which is the pane on the vellum ground — the
      // one place the material and the reading register are combined.
      await page.goto(`/markers/${await markerWithHistory(ctx.request)}`);
      await page.getByText('What this marker means').waitFor({ timeout: 30_000 });
      await settle(page);
      await page
        .locator('.glass-vellum')
        .first()
        .screenshot({ path: path.join(OUT, `glass-vellum-${theme}.png`) });

      await ctx.close();
    });
  }
});
