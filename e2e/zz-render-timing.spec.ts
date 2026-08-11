import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * HOW LONG THE FULL SIGNATURE REPORT ACTUALLY TAKES, AT TRUE SIZE.
 *
 * Signature is 433 markers: ~162 measured, 207 food IgG items, 32 genetic
 * indicators, 10 microbiome proportions and 22 qualitative findings. It is by
 * a long way the largest thing this product renders, and every other spec
 * opens the biggest RELEASED report without caring how long it took.
 *
 * Measured rather than asserted-against. There is no threshold here on
 * purpose: a number in CI that fails at 3.1 seconds and passes at 2.9 tells
 * whoever sees it nothing about whether the page is acceptable, and the
 * machine it runs on decides the answer. What is useful is the breakdown —
 * how much is the request, how much is the render, and how much of the render
 * is the food-sensitivity list — printed where somebody can read it.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_TIMING=1`.
 */

const RUN = process.env.E2E_TIMING === '1';
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

test.describe('render timing', () => {
  test.skip(!RUN, 'set E2E_TIMING=1 to measure');
  // The measurement itself is ~4 seconds. The generous timeout is for the
  // thing being measured going wrong — a report that never finishes rendering
  // is the finding, and it has to be allowed to be slow before it can be
  // reported as slow.
  test.describe.configure({ timeout: 180_000 });

  test('the full Signature report at true size', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();

    const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
      reportId: string;
      panelName: string | null;
      patientStatus: string;
      markerCount?: number;
    }[];
    const signature =
      reports.find((r) => r.patientStatus === 'RELEASED' && r.panelName === 'Signature') ??
      [...reports.filter((r) => r.patientStatus === 'RELEASED')].sort(
        (a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0),
      )[0];

    // The API on its own, so the render figure below is a render figure.
    const apiStart = Date.now();
    const detail = (await (await ctx.request.get(`/api/patient/reports/${signature.reportId}`)).json()) as {
      markers: { resultType?: string }[];
    };
    const apiMs = Date.now() - apiStart;

    const start = Date.now();
    await page.goto(`/reports/${signature.reportId}`);
    // The last thing on the page rather than the first: the food-sensitivity
    // section is below everything else, so waiting for it waits for all of it.
    await page.getByRole('heading', { name: 'Food sensitivity' }).waitFor({ timeout: 120_000 });
    const toLastSection = Date.now() - start;
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const toIdle = Date.now() - start;

    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
      return {
        domContentLoaded: e ? Math.round(e.domContentLoadedEventEnd - e.startTime) : null,
        firstContentfulPaint: paint ? Math.round(paint.startTime) : null,
        nodes: document.getElementsByTagName('*').length,
        height: Math.round(document.body.scrollHeight),
      };
    });

    const byType = detail.markers.reduce<Record<string, number>>((acc, m) => {
      const t = m.resultType ?? 'MEASURED';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      [
        '',
        '─── Signature report, full size ─────────────────────────────────',
        `  markers on the report   ${detail.markers.length}  ${JSON.stringify(byType)}`,
        `  API request             ${apiMs} ms`,
        `  first contentful paint  ${nav.firstContentfulPaint} ms`,
        `  DOMContentLoaded        ${nav.domContentLoaded} ms`,
        `  to the last section     ${toLastSection} ms   (everything rendered)`,
        `  to network idle         ${toIdle} ms`,
        `  DOM nodes               ${nav.nodes}`,
        `  page height             ${nav.height} px`,
        '─────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    // The only assertion: it finished, and it finished with everything on it.
    expect(detail.markers.length).toBeGreaterThan(400);
    await ctx.close();
  });
});
