import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A SCREENSHOT WALK, not an assertion suite.
 *
 * Every patient and admin route, in both themes, written to `screenshots/` so
 * a person can look at them. It asserts almost nothing on purpose — the other
 * specs do that, and a spec that both takes pictures and makes claims tends to
 * do neither well. What it does assert is that each page mounted SOMETHING,
 * because a screenshot of a blank page is indistinguishable from a screenshot
 * of a page that is meant to be quiet.
 *
 * Named `zz-` so it runs last: `fullyParallel` is off and workers are 1, so
 * ordering is filename order, and a walk of forty pages should not sit in
 * front of the specs that actually gate the build.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`. It is slow, it writes files,
 * and it fails nothing — three good reasons not to run it in a normal pass.
 */

const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots');

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
const ADMIN_EMAIL = 'admin@aspireshield.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!';

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

/**
 * WHICH WIDTHS ARE WALKED.
 *
 * 1440 is the desktop this product is designed at. 390 x 844 is a phone — an
 * iPhone 14's CSS viewport — and it is a different LAYOUT rather than a
 * narrower one: the sidebar is a drawer behind a header, the results grid is
 * one column, the marker page's 40/60 pair stacks, and `.value-row` switches to
 * its two-line arrangement. None of that is exercised by a 1440 walk, which is
 * why the walk ran at one width for months and mobile was reviewed by eye.
 *
 * The theme and the width together, so a file name says which of the four a
 * picture is.
 */
const WIDTHS = [
  { key: '', width: 1440, height: 900 },
  { key: '-mobile', width: 390, height: 844 },
] as const;

type Width = (typeof WIDTHS)[number];

/** A context with the theme and the width already chosen, so nothing flashes on first paint. */
async function themedContext(browser: Browser, theme: 'light' | 'dark', size: Width = WIDTHS[0]) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    // A real phone reports a touch primary pointer and a device pixel ratio,
    // and `hover:` utilities do not apply on one. A 390px desktop window is not
    // a phone and would photograph hover states nobody on a phone can reach.
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

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Entrance animations are 200–600ms; a shot taken mid-fade is a picture of
  // an animation rather than of a page.
  await page.waitForTimeout(900);

  // WALK THE PAGE BEFORE CAPTURING IT, and this is not optional for a fullPage
  // shot. Everything below the fold is wrapped in `Reveal`, which starts at
  // `opacity: 0` and is brought in by an IntersectionObserver. A fullPage
  // screenshot resizes the viewport to the document rather than scrolling
  // through it, so the observer never fires for anything that was off-screen —
  // and the picture that comes back is a correct page with three quarters of
  // it invisible. The Overview came back 15,342px tall and almost entirely
  // blank, which reads exactly like a broken layout and is not one.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  // The 600ms reveal transition, plus a beat.
  await page.waitForTimeout(800);
}

test.describe('screenshots', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  // 6 minutes, not the 15 a walk like this reaches for by habit. The admin
  // sweep is the longest at ~2 minutes, so this is roughly triple the real
  // figure — enough headroom for a cold Vite dev server and not so much that a
  // genuinely hung page sits there for a quarter of an hour pretending to work.
  test.describe.configure({ timeout: 360_000 });

  for (const size of WIDTHS) {
  test(`every patient route, both themes${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await themedContext(browser, theme, size);
      await login(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
      const page = await ctx.newPage();

      const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
        reportId: string;
        patientStatus: string;
        markerCount?: number;
      }[];
      const biggest = [...reports.filter((r) => r.patientStatus === 'RELEASED')].sort(
        (a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0),
      )[0];
      const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
        markerId: string;
        resultCount: number;
        resultType?: string;
      }[];
      const plottable = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount > 1);

      const routes: { name: string; path: string }[] = [
        { name: 'overview', path: '/overview' },
        { name: 'results-by-marker', path: '/results' },
        { name: 'results-by-report', path: '/results?view=by-report' },
        { name: 'results-compare', path: `/results?view=compare&markers=${plottable.slice(0, 3).map((m) => m.markerId).join(',')}` },
        { name: 'report', path: `/reports/${biggest.reportId}` },
        { name: 'marker-detail', path: `/markers/${plottable[0].markerId}` },
        { name: 'library', path: '/library' },
        { name: 'documents', path: '/documents' },
        { name: 'account', path: '/account' },
      ];

      for (const route of routes) {
        await page.goto(route.path);
        await settle(page);
        // Something mounted. A blank screenshot and a quiet page look identical.
        expect(await page.locator('main').count(), `${route.path} rendered no main`).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(OUT, `patient-${route.name}-${theme}${size.key}.png`), fullPage: true });
      }
      await ctx.close();
    }
  });
  }

  for (const size of WIDTHS) {
  test(`every admin route, both themes${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await themedContext(browser, theme, size);
      await login(ctx.request, ADMIN_EMAIL, ADMIN_PASSWORD);
      const page = await ctx.newPage();

      const routes = [
        { name: 'dashboard', path: '/admin' },
        { name: 'patients', path: '/admin/patients' },
        { name: 'reports', path: '/admin/reports' },
        { name: 'panels', path: '/admin/panels' },
        { name: 'markers', path: '/admin/markers' },
        { name: 'ingestion-log', path: '/admin/ingestion-log' },
        { name: 'linking', path: '/admin/linking' },
        { name: 'explanations', path: '/admin/explanations' },
        { name: 'audit', path: '/admin/audit' },
      ];

      for (const route of routes) {
        await page.goto(route.path);
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `admin-${route.name}-${theme}${size.key}.png`), fullPage: true });
      }
      await ctx.close();
    }
  });
  }

  /**
   * THE SIDEBAR AGAINST THE GLOW, at both ends of it.
   *
   * The panel is a translucent wash rather than a surface, so the interesting
   * question is not "what does it look like" but "does it still read as a
   * panel where the contrast between it and the page is smallest, and where it
   * is largest". Those are two different places on the same screen:
   *
   *  · NEAR CORNER — top-left of the panel, which is the closest it gets to
   *    the light anchored in the top right. Least separation.
   *  · FAR CORNER — bottom-left, as far from the source as the viewport goes.
   *    Most separation, and the place a wash can start to read as a slab.
   *
   * Both are cropped tight around the panel edge so the seam is the subject of
   * the picture rather than a detail in it, and a wide shot is taken beside
   * them so the two can be judged in context.
   */
  test('the sidebar against the glow, near corner and far', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await themedContext(browser, theme);
      await login(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
      const page = await ctx.newPage();
      await page.goto('/overview');
      await settle(page);

      await page.screenshot({ path: path.join(OUT, `sidebar-full-${theme}.png`) });

      // 360px wide, so it spans the 288px panel and 72px of the content area:
      // the seam sits inside the frame with page on both sides of it.
      await page.screenshot({
        path: path.join(OUT, `sidebar-near-corner-${theme}.png`),
        clip: { x: 0, y: 0, width: 360, height: 300 },
      });
      await page.screenshot({
        path: path.join(OUT, `sidebar-far-corner-${theme}.png`),
        clip: { x: 0, y: 600, width: 360, height: 300 },
      });

      // Collapsed, because the wash has to work at 84px too — a narrow column
      // is a higher proportion of edge to fill.
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(OUT, `sidebar-collapsed-${theme}.png`),
        clip: { x: 0, y: 0, width: 360, height: 400 },
      });

      await ctx.close();
    }
  });
});
