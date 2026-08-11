import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * ---------------------------------------------------------------------------
 * NO CHART BAND IS EVER A SLIVER.
 * ---------------------------------------------------------------------------
 *
 * The trend chart used to draw one band set PER RESULT, running from that
 * result's x to the next one's — and the LAST one from its own x to tMax,
 * which is the padding gutter. So a marker whose reference range changed on
 * the most recent result had the new range drawn as a 24px vertical strip
 * against a 510px plot, stacked beside the final point, with nothing on screen
 * saying the range had changed. Measured, on the demo data's Fasting Insulin
 * (2–25, 2–25, then 2–10): segment widths 235, 187, 24.
 *
 * Two bands overlapping, or one of them 5% of the plot wide, is a fact you
 * MEASURE — it is not something anybody reliably notices in a screenshot,
 * which is how it survived. Same reasoning as previous-results-layout.spec.ts.
 *
 * What is asserted:
 *
 *  1. A series on ONE reference range gets ONE band set, spanning the whole
 *     plot. Not N abutting copies of the same geometry.
 *  2. A series whose range CHANGES gets one band set per period, each a
 *     substantial share of the plot, with the step drawn as a dashed rule.
 *  3. The chart SAYS the range changed, in words, and names it in the key.
 *  4. In neither case is any band narrower than a tenth of the plot.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** No band may be narrower than this share of the plot area. */
const MIN_BAND_SHARE = 0.1;

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

interface BandGeometry {
  plotWidth: number;
  /** One entry per distinct x-extent, i.e. one per band period. */
  periods: { x: number; width: number; bands: number }[];
  narrowest: number;
  stepRules: number;
  /** Every dashed vertical rule: its x, and the y range it spans. */
  steps: { x: number; y1: number; y2: number; width: number; opacity: number; dash: string }[];
  /** The horizontal band-boundary hairlines, as x extents. */
  hairlines: { x1: number; x2: number }[];
  /** The plot area itself, for "does the rule run its full height". */
  plot: { x: number; y: number; width: number; height: number };
  /** The inline reference-bound labels — mono numerals drawn beside a boundary. */
  boundLabels: { text: string; x: number }[];
}

async function bandGeometry(page: Page): Promise<BandGeometry> {
  return page.evaluate(() => {
    const svg = document.querySelector('.recharts-surface') as SVGSVGElement;
    const areas = [...svg.querySelectorAll('.recharts-reference-area-rect')] as SVGRectElement[];
    // The status bands are the tall ones; the boundary hairlines are drawn as
    // very thin bands of the same kind and are excluded by height.
    const bands = areas
      .map((r) => ({
        x: Math.round(Number(r.getAttribute('x'))),
        width: Math.round(Number(r.getAttribute('width'))),
        height: Math.round(Number(r.getAttribute('height'))),
      }))
      .filter((r) => r.height > 8);

    const byExtent = new Map<string, { x: number; width: number; bands: number }>();
    for (const band of bands) {
      const key = `${band.x}:${band.width}`;
      const entry = byExtent.get(key) ?? { x: band.x, width: band.width, bands: 0 };
      entry.bands += 1;
      byExtent.set(key, entry);
    }
    const periods = [...byExtent.values()].sort((a, b) => a.x - b.x);
    const plotWidth = periods.reduce((total, p) => total + p.width, 0);

    const lines = [...svg.querySelectorAll('.recharts-reference-line line')] as SVGLineElement[];
    const num = (el: SVGLineElement, a: string) => Number(el.getAttribute(a));
    // Vertical and dashed: the step. Horizontal: a band boundary. The optimal
    // band's own dashed edges are horizontal, so the orientation test separates
    // them from the step without depending on the dash pattern.
    const steps = lines
      .filter((l) => Math.abs(num(l, 'x1') - num(l, 'x2')) < 0.5 && (l.getAttribute('stroke-dasharray') ?? '') !== '')
      .map((l) => ({
        x: Math.round(num(l, 'x1')),
        y1: Math.round(Math.min(num(l, 'y1'), num(l, 'y2'))),
        y2: Math.round(Math.max(num(l, 'y1'), num(l, 'y2'))),
        width: Number(l.getAttribute('stroke-width')),
        opacity: Number(l.getAttribute('stroke-opacity')),
        dash: l.getAttribute('stroke-dasharray') ?? '',
      }));
    const hairlines = lines
      .filter((l) => Math.abs(num(l, 'y1') - num(l, 'y2')) < 0.5)
      .map((l) => ({
        x1: Math.round(Math.min(num(l, 'x1'), num(l, 'x2'))),
        x2: Math.round(Math.max(num(l, 'x1'), num(l, 'x2'))),
      }));

    // Recharts does not expose the plot rect in the DOM, so it is taken from the
    // x-axis ticks' own extent plus the axis line.
    const axis = svg.querySelector('.recharts-xAxis .recharts-cartesian-axis-line') as SVGLineElement | null;
    const plot = {
      x: axis ? Math.round(num(axis, 'x1')) : 0,
      y: 0,
      width: axis ? Math.round(num(axis, 'x2') - num(axis, 'x1')) : 0,
      height: axis ? Math.round(num(axis, 'y1')) : 0,
    };

    // The inline bound labels are the only mono <text> nodes outside the axes.
    const boundLabels = ([...svg.querySelectorAll('text')] as SVGTextElement[])
      .filter((t) => !t.closest('.recharts-cartesian-axis'))
      .filter((t) => (t.getAttribute('font-family') ?? '').includes('mono'))
      .map((t) => ({ text: t.textContent ?? '', x: Math.round(Number(t.getAttribute('x'))) }));

    return {
      plotWidth,
      periods,
      narrowest: Math.min(...periods.map((p) => p.width)),
      // The dashed vertical rules marking where the range changed.
      stepRules: steps.length,
      steps,
      hairlines,
      plot,
      boundLabels,
    };
  });
}

/** Every marker with a plottable trend, split by whether its range changes. */
async function findTrends(ctx: { request: APIRequestContext }) {
  const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
    markerId: string;
    name: string;
    resultType?: string;
    value: number | null;
  }[];
  const stable: { id: string; name: string }[] = [];
  const changing: { id: string; name: string }[] = [];

  for (const marker of markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.value != null)) {
    const detail = (await (await ctx.request.get(`/api/patient/markers/${marker.markerId}`)).json()) as {
      trend?: { referenceLow: number; referenceHigh: number; severityThreshold?: number }[];
    };
    const trend = detail.trend ?? [];
    if (trend.length < 2) continue;
    const ranges = new Set(trend.map((p) => `${p.referenceLow}|${p.referenceHigh}|${p.severityThreshold}`));
    (ranges.size > 1 ? changing : stable).push({ id: marker.markerId, name: marker.name });
    if (stable.length >= 3 && changing.length >= 1) break;
  }
  return { stable, changing };
}

test('a series on one reference range gets one full-width band set', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  await signIn(ctx.request);
  const { stable } = await findTrends(ctx);
  expect(stable.length, 'the demo data should contain a stable-range trend').toBeGreaterThan(0);

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  for (const marker of stable.slice(0, 3)) {
    await page.goto(`/markers/${marker.id}`);
    await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);

    const geometry = await bandGeometry(page);
    expect(geometry.periods.length, `${marker.name}: one range means one band period`).toBe(1);
    expect(geometry.periods[0].bands, `${marker.name}: the five status bands`).toBeGreaterThanOrEqual(3);
    // Nothing to step over, so nothing says a range changed.
    expect(geometry.stepRules, `${marker.name}: no step rule on a stable range`).toBe(0);
    await expect(page.getByText('The lab’s reference range changed during this period')).toHaveCount(0);
  }
  await ctx.close();
});

test('a series whose reference range changes steps, and says so', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  await signIn(ctx.request);
  const { changing } = await findTrends(ctx);
  expect(changing.length, 'the demo data should contain a trend whose range changes').toBeGreaterThan(0);

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const marker = changing[0];
  await page.goto(`/markers/${marker.id}`);
  await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);

  const geometry = await bandGeometry(page);

  // Stepped: more than one period.
  expect(geometry.periods.length, `${marker.name}: a changed range is drawn as separate periods`).toBeGreaterThan(1);

  // AND NONE OF THEM IS A SLIVER. This is the assertion the whole file is for.
  for (const period of geometry.periods) {
    const share = period.width / geometry.plotWidth;
    expect(
      share,
      `${marker.name}: a band period ${period.width}px wide on a ${geometry.plotWidth}px plot is a sliver`,
    ).toBeGreaterThan(MIN_BAND_SHARE);
  }

  // The step is drawn...
  expect(geometry.stepRules, `${marker.name}: the change point is marked`).toBe(geometry.periods.length - 1);
  // ...named in the key...
  await expect(page.getByText('Where the reference range changed')).toBeVisible();
  // ...and stated in words, because a silent change of reference range between
  // two results is exactly what misleads someone reading their own trend.
  await expect(page.getByText('The lab’s reference range changed during this period')).toBeVisible();

  // -------------------------------------------------------------------------
  // AND IT LOOKS THE SAME EVERY TIME IT HAPPENS.
  //
  // "Consistent" is four separate facts, and each of them is a measurement
  // rather than something anybody notices in a screenshot.
  // -------------------------------------------------------------------------

  // 1. EVERY BAND STEPS TOGETHER. The periods are grouped by exact x-extent, so
  //    one band edge landing anywhere of its own shows up as an extra period
  //    with a partial band count. Every period carries the same number.
  const bandCounts = [...new Set(geometry.periods.map((p) => p.bands))];
  expect(bandCounts, `${marker.name}: the bands do not all share their period's extent`).toHaveLength(1);
  expect(geometry.periods.length, `${marker.name}: one step rule per boundary between periods`).toBe(
    geometry.stepRules + 1,
  );

  // 2. THE RULE IS AT THE BOUNDARY, not near it. Each step's x is the x where
  //    one period ends and the next begins.
  const boundaries = geometry.periods.slice(1).map((p) => p.x);
  for (const step of geometry.steps) {
    expect(
      boundaries.some((x) => Math.abs(x - step.x) <= 1),
      `${marker.name}: a step rule at x=${step.x} sits at no band boundary (${boundaries.join(', ')})`,
    ).toBe(true);
  }

  // 3. ONE DASHED HAIRLINE, FULL PLOT HEIGHT, SAME WEIGHT AND PATTERN EVERY
  //    TIME. The values come from chart.stepDashArray / stepWidth / stepOpacity.
  for (const step of geometry.steps) {
    expect(step.dash, `${marker.name}: the step's dash pattern`).toBe('3 3');
    expect(step.width, `${marker.name}: the step's weight`).toBe(1);
    expect(step.opacity, `${marker.name}: the step's opacity`).toBeCloseTo(0.7, 2);
    expect(step.y2 - step.y1, `${marker.name}: the step runs the full plot height`).toBeGreaterThan(
      geometry.plot.height * 0.9,
    );
  }

  // 4. THE HORIZONTAL HAIRLINES STAY IN THEIR OWN PERIOD and meet the step
  //    cleanly. A boundary line spanning the whole plot would draw the old
  //    range's edge across the new range's territory.
  const extents = geometry.periods.map((p) => ({ x1: p.x, x2: p.x + p.width }));
  for (const line of geometry.hairlines) {
    const fits = extents.some((e) => Math.abs(e.x1 - line.x1) <= 1 && Math.abs(e.x2 - line.x2) <= 1);
    // The optimal band's dashed edges do span the plot, by design — they are an
    // advisory band and not a per-period reference bound. They are excluded by
    // matching the FULL extent rather than by their dash pattern.
    const spansPlot = Math.abs(line.x2 - line.x1 - geometry.plot.width) <= 2;
    expect(fits || spansPlot, `${marker.name}: a boundary hairline runs ${line.x1}–${line.x2}, which is no period`).toBe(
      true,
    );
  }

  // 5. BOTH RANGES ARE LABELLED. Each period's bounds are printed at the right
  //    hand end of its own extent, so the reader can see what the range stepped
  //    FROM without going to the sentence. Two periods, two bounds each.
  expect(
    geometry.boundLabels.length,
    `${marker.name}: expected a bound label per period bound, got ${JSON.stringify(geometry.boundLabels)}`,
  ).toBeGreaterThanOrEqual(geometry.periods.length * 2);
  // AND NONE OF THEM IS AN UNROUNDED FLOAT. A converted range arrives with no
  // rounding of its own and printed 5.494444506110488 beside the plot.
  for (const label of geometry.boundLabels) {
    expect(label.text.length, `${marker.name}: "${label.text}" is a raw float, not a reference bound`).toBeLessThanOrEqual(
      7,
    );
  }

  await ctx.close();
});
