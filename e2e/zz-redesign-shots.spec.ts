import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * THE FOUR THINGS THAT CHANGED IN AUGUST 2026, PHOTOGRAPHED WHERE THEY DIFFER.
 *
 * `zz-screenshots.spec.ts` walks every route at its resting state and would
 * catch none of these: three of the four are STATES rather than screens.
 *
 *  · THE SECTION INDEX on a report — a row of chips under the at-a-glance
 *    strip, saying what is on the page below the marker grid. Only visible on
 *    a report that HAS sections below it, i.e. the Signature panel.
 *  · THE CATEGORY FILTER OPEN, showing its two groups. The whole change is
 *    that result types and health areas are now one control, and a closed
 *    picker shows neither.
 *  · THE SECTION RAIL in both of its states, at both of the widths it is read
 *    at. The collapsed one is what the reader spends their time with and it
 *    exists only after a scroll.
 *  · THE TREND CHART at a value near a reference bound and at one well past
 *    it, which is where moving the gradient from across the band to across the
 *    boundary is the difference. Chosen from the patient's real data rather
 *    than staged: the change is about how a real number is drawn.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`.
 */
const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots');

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => {
    localStorage.setItem('aspire-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

/** Motion off, so a screenshot is of the page rather than of a frame of it. */
async function settle(page: Page, ms = 900) {
  await page.waitForTimeout(ms);
}

/** The report with a full spread of result types on it — the Signature panel. */
async function biggestReport(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/patient/reports');
  const reports = (await res.json()) as { reportId: string; markerCount: number; patientStatus: string }[];
  const biggest = reports
    .filter((r) => r.patientStatus === 'RELEASED')
    .sort((a, b) => b.markerCount - a.markerCount)[0];
  expect(biggest, 'no released report in the demo data — run the seed').toBeTruthy();
  return biggest.reportId;
}

/**
 * Two markers, chosen by how far outside their own range they sit.
 *
 * NEAR is a result within a fifth of a range-width of a reference bound —
 * the case the boundary gradient exists for, where a hard edge used to say
 * that one unit either side of the limit is a different kind of result. FAR is
 * one past the significantly-out threshold, where the ramp has finished and the
 * band is flat red.
 */
async function markersEitherSide(request: APIRequestContext): Promise<{ near: string; far: string }> {
  const res = await request.get('/api/patient/markers');
  const markers = (await res.json()) as {
    markerId: string;
    name: string;
    resultType?: string;
    value: number | null;
    status: string | null;
    referenceLow: number | null;
    referenceHigh: number | null;
    resultCount: number;
  }[];
  const usable = markers.filter(
    (m) =>
      (m.resultType ?? 'MEASURED') === 'MEASURED' &&
      m.value != null &&
      m.referenceLow != null &&
      m.referenceHigh != null &&
      m.referenceHigh > m.referenceLow &&
      m.resultCount >= 2 &&
      // A range spanning three orders of magnitude (the demo's 1–999 HDL) is a
      // data problem rather than a marker, and it makes a picture of a boundary
      // in which the boundary is a hairline at the very top of the plot.
      m.referenceLow! > 0 &&
      m.referenceHigh! / m.referenceLow! < 50,
  );
  /** How far outside the range this result sits, as a share of the range's own width. */
  const distance = (m: (typeof usable)[number]) => {
    const width = m.referenceHigh! - m.referenceLow!;
    return Math.max(m.referenceLow! - m.value!, m.value! - m.referenceHigh!) / width;
  };
  // NEAR is a result close to a bound on either side of it — inside or just
  // out — which is exactly the case a hard edge used to draw as two different
  // kinds of result. FAR is past the significantly-out threshold, where the
  // ramp has finished and the band is flat red.
  const near = [...usable].sort((a, b) => Math.abs(distance(a)) - Math.abs(distance(b)))[0];
  const far = [...usable].sort((a, b) => distance(b) - distance(a))[0];
  expect(near && far, 'the demo data has no measured marker with a usable two-sided range').toBeTruthy();
  return { near: near.markerId, far: far.markerId };
}

test.describe('the August 2026 redesign', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 300_000 });

  for (const theme of THEMES) {
    test(`the section index and the category filter, ${theme}`, async ({ browser }: { browser: Browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await login(ctx.request);
      const page = await ctx.newPage();
      const reportId = await biggestReport(ctx.request);

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/reports/${reportId}`);
      await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
      await settle(page);

      // THE INDEX, in place under the strip it is subordinate to. The framing
      // is the point of the shot: the two have to read as headline and
      // contents rather than as two headlines.
      await page.screenshot({ path: path.join(OUT, `report-section-index-${theme}.png`) });

      // THE CATEGORY FILTER OPEN, showing both groups at once. Scrolled first
      // so the bar is pinned at the top of the window: opened where it sits in
      // the page, the popover runs off the bottom and the picture shows one
      // group heading and nothing under it.
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.evaluate(() => window.scrollTo({ top: 760, behavior: 'instant' as ScrollBehavior }));
      await settle(page, 400);
      await page.getByLabel('Category').click();
      await settle(page, 400);
      // Scrolled to the SEAM between the two groups. There are twenty health
      // areas on a Signature panel, so no popover shows both groups whole and
      // a picture of the top of the list shows one heading and no evidence
      // that the other exists — which is the entire change.
      await page.locator('[role="listbox"]').evaluate((el) => {
        const heading = [...el.querySelectorAll('li')].find((li) => li.textContent?.trim() === 'Health area');
        if (heading) el.scrollTop = (heading as HTMLElement).offsetTop - 90;
      });
      await settle(page, 300);
      await page.screenshot({ path: path.join(OUT, `report-category-filter-${theme}.png`) });

      await ctx.close();
    });

    for (const width of [1440, 1920]) {
      test(`the section rail, expanded and collapsed, ${width} ${theme}`, async ({ browser }: { browser: Browser }) => {
        fs.mkdirSync(OUT, { recursive: true });
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await login(ctx.request);
        const page = await ctx.newPage();

        await page.goto('/overview');
        await setTheme(page, theme);
        await page.reload();
        await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 30_000 });
        await settle(page);

        // AT REST: a list of horizontal labels you can read without doing
        // anything to it.
        await page.screenshot({ path: path.join(OUT, `overview-rail-expanded-${width}-${theme}.png`) });

        // SCROLLED: a line with a node per section, one of them filled. The
        // scroll is far enough down the page that the active node is not the
        // first — a picture of the collapsed rail with the first node filled
        // says nothing about whether it tracks anything.
        await page.evaluate(() => {
          const target = document.getElementById('go-deeper');
          if (!target) return;
          window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' as ScrollBehavior });
        });
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `overview-rail-collapsed-${width}-${theme}.png`) });

        await ctx.close();
      });
    }

    test(`the trend chart either side of a boundary, ${theme}`, async ({ browser }: { browser: Browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await login(ctx.request);
      const page = await ctx.newPage();
      const { near, far } = await markersEitherSide(ctx.request);

      await page.goto('/overview');
      await setTheme(page, theme);

      for (const [label, markerId] of [
        ['near-boundary', near],
        ['far-out', far],
      ] as const) {
        await page.goto(`/markers/${markerId}`);
        await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `marker-chart-${label}-${theme}.png`) });
      }

      await ctx.close();
    });
  }
});
