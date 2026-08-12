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

    // ─────────────────────────────────────────────────────────────────
    // AND THE FOOD LIST OPENED, which is the part virtualisation is about.
    //
    // The figures above are the page AS IT LOADS, and the food groups are
    // collapsed by default — so the 207 items are not in the document at all
    // and the height above is the ~165 measured marker cards plus the other
    // sections. Worth stating, because "the food list is most of the page" is
    // the obvious explanation for a 23,000px report and it is not the true one
    // until somebody opens it.
    //
    // Typing into the section's own search opens every matching group, which
    // is the state the list is virtualised for. A one-letter query most foods
    // contain puts the whole list on screen at once.
    // ─────────────────────────────────────────────────────────────────
    const before = nav.nodes;
    await page.getByLabel('Search', { exact: true }).last().fill('a');
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => ({
      nodes: document.getElementsByTagName('*').length,
      height: Math.round(document.body.scrollHeight),
      rows: document.querySelectorAll('[id^="sensitivity-"] .value-row').length,
    }));
    console.log(
      [
        '─── the food list, opened ───────────────────────────────────────',
        `  DOM nodes               ${opened.nodes}   (+${opened.nodes - before} over collapsed)`,
        `  page height             ${opened.height} px`,
        `  food rows in the DOM    ${opened.rows}   (of 207 matching, the rest are spacers)`,
        '─────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    // The only assertions: it finished with everything on it, and opening the
    // food list did not put all 207 rows in the document.
    expect(detail.markers.length).toBeGreaterThan(400);
    expect(opened.rows, 'the opened food list is not virtualised').toBeLessThan(150);
    await ctx.close();
  });
});

/**
 * ===========================================================================
 *  WHAT THE GLASS COSTS, ON THE LONGEST LIST IN THE PRODUCT.
 * ===========================================================================
 *
 * `GLASS.blur` is 14px and was written down as a frame budget. A budget nobody
 * measures is a guess with a unit on it, so this measures it: the by-marker
 * view (437 markers) scrolled with the pinned control bar's backdrop filter
 * active, against the same scroll with the filter removed.
 *
 * HOW IT IS MEASURED, AND WHY NOT `page.metrics()`. A backdrop filter costs a
 * compositing pass per frame, which never appears in JS timing — the main
 * thread is idle while the compositor is late. What a reader actually
 * experiences is FRAME INTERVALS, so that is what is recorded:
 * requestAnimationFrame timestamps during a real scroll, turned into a frame
 * rate and a count of frames that took longer than 20ms (i.e. dropped one at
 * 60Hz).
 *
 * The comparison matters more than the absolute. A headless Chromium on a CI
 * box is not anybody's laptop, so "58fps" on its own says little; "58 with the
 * glass and 59 without it" says the filter is not the problem.
 */
test.describe('glass scroll cost', () => {
  test.skip(!RUN, 'set E2E_TIMING=1 to measure');
  test.describe.configure({ timeout: 180_000 });

  test('scrolling the by-marker list with the pinned glass bar', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();

    await page.goto('/results?view=by-marker');
    await page.getByText('Every marker on record').first().waitFor({ timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    const markerCount = await page.locator('.card').count();

    async function scrollProfile(label: string) {
      return page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const frames: number[] = [];
        let last = performance.now();
        const start = last;
        await new Promise<void>((resolve) => {
          function step(now: number) {
            frames.push(now - last);
            last = now;
            // A steady scroll rather than one jump: the cost of a backdrop
            // filter is per FRAME it is composited on, so it only shows up
            // under continuous movement.
            window.scrollBy(0, 24);
            if (now - start > 3000) return resolve();
            requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
        // The first interval is measured from before the loop started and is
        // not a frame anybody saw.
        const deltas = frames.slice(1);
        const total = deltas.reduce((a, b) => a + b, 0);
        const sorted = [...deltas].sort((a, b) => a - b);
        return {
          frames: deltas.length,
          fps: Math.round((deltas.length / total) * 1000),
          medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
          worstMs: Number(sorted[sorted.length - 1].toFixed(1)),
          dropped: deltas.filter((d) => d > 20).length,
          scrolledTo: Math.round(window.scrollY),
        };
      });
    }

    // The bar has to be PINNED for the glass to exist at all — it fades in on
    // pin and is absent at rest, so profiling from the top of the page would
    // measure a page with no backdrop filter on it and report a clean result.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(400);
    const glassOn = await page.evaluate(
      () => document.querySelectorAll('.glass.is-pinned, .glass-veil.is-pinned').length,
    );

    const withGlass = await scrollProfile('glass');

    /**
     * THE SWEEP. `GLASS.blur` is a budget, so the question is not "is 14px
     * slow" but "what is the largest radius that is not". Each pass changes
     * ONLY `--glass-blur` on the document, so every other cost — the same 166
     * cards, the same scroll, the same compositing of the same translucent
     * fill — is held constant and the difference is the radius.
     */
    const sweep: { blur: string; fps: number; medianMs: number; dropped: number }[] = [];
    for (const blur of ['14px', '10px', '8px', '6px', '4px', '2px']) {
      await page.evaluate((b) => document.documentElement.style.setProperty('--glass-blur', b), blur);
      await page.waitForTimeout(300);
      const r = await scrollProfile(blur);
      sweep.push({ blur, fps: r.fps, medianMs: r.medianMs, dropped: r.dropped });
    }
    await page.evaluate(() => document.documentElement.style.removeProperty('--glass-blur'));

    // The same scroll with the filter taken out, and nothing else changed.
    await page.addStyleTag({
      content: '.glass, .panel-wash { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    });
    await page.waitForTimeout(400);
    const withoutGlass = await scrollProfile('no glass');

    console.log(
      [
        '',
        '─── glass scroll cost, by-marker view ───────────────────────────',
        `  cards on the page       ${markerCount}`,
        `  pinned glass surfaces   ${glassOn}`,
        `  with glass              ${withGlass.fps} fps · median ${withGlass.medianMs}ms · worst ${withGlass.worstMs}ms · ${withGlass.dropped} frames over 20ms`,
        ...sweep.map(
          (r) => `  blur ${r.blur.padEnd(6)}            ${String(r.fps).padStart(2)} fps · median ${r.medianMs}ms · ${r.dropped} frames over 20ms`,
        ),
        `  backdrop-filter off     ${withoutGlass.fps} fps · median ${withoutGlass.medianMs}ms · worst ${withoutGlass.worstMs}ms · ${withoutGlass.dropped} frames over 20ms`,
        '─────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    expect(glassOn, 'the control bar was not pinned, so no glass was being composited').toBeGreaterThan(0);
    await ctx.close();
  });
});
