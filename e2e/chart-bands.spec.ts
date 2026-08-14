import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * ---------------------------------------------------------------------------
 * THE TREND CHART'S GEOMETRY, MEASURED — AND THE BANDS ARE GONE (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * WHAT THIS FILE USED TO MEASURE AND WHY IT STILL EXISTS.
 *
 * The chart drew five filled status bands per reference-range period, and this
 * file measured their rectangles: one range meant one full-width band set, a
 * changed range meant one set per period, and no set was ever a sliver. That
 * last one was a real defect — a marker whose range changed on the most recent
 * result had the new range drawn as a 24px strip against a 510px plot
 * (measured: 235, 187, 24) with nothing on screen saying the range had moved.
 *
 * THE BANDS HAVE BEEN REMOVED. The chart is a line, four boundary rules and an
 * axis, drawn on the card. So the RECTANGLES this file measured no longer
 * exist — and every property they protected still does, because the periods are
 * still periods and the rules are still drawn per period. The measurement moved
 * from the rects to the RULES rather than being deleted:
 *
 *   · one range  → one x-extent, spanning the plot
 *   · a change   → one x-extent per period, none of them a sliver
 *   · the step   → a dashed vertical at exactly the boundary between them
 *   · the words  → the sentence and the key entry
 *
 * AND THREE THINGS ARE ASSERTED THAT COULD NOT BE BEFORE, because they are the
 * new evidence:
 *
 *   5. NOTHING IS FILLED. Zero band rects, zero optimal regions, zero plot
 *      panel — "no filled regions of any kind" is the instruction, and it is
 *      the one property a screenshot review is worst at checking.
 *   6. THE LINE CARRIES THE STATUS ALONG ITS LENGTH, as a gradient with a stop
 *      per point in that point's own status colour.
 *   7. EVERY BOUNDARY IS LABELLED WITH ITS VALUE, and a reference bound is
 *      told from a significantly-out threshold by a solid lead rule against a
 *      dashed one — not by colour.
 *
 * Two boxes overlapping, a 1px rule out of place and a gradient with one stop
 * are all facts you MEASURE. Same reasoning as previous-results-layout.spec.ts.
 *
 * THE STEPPED SERIES IS BUILT BY THIS FILE. It used to be found — whichever
 * demo marker happened to have drifted — and the demo deliberately has none
 * now. `buildSteppedSeries` publishes two reports with two ranges on one
 * marker, so the numbers being measured are written down rather than inherited.
 * The derivation underneath is unit-tested from fixtures too
 * (apps/server/tests/referenceRangePeriods.test.ts); this file is the half that
 * has to happen in a browser.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo and admin accounts.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** No period may be narrower than this share of the plot area. */
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

interface ChartGeometry {
  plotWidth: number;
  /** One entry per distinct x-extent — i.e. one per reference-range period. */
  periods: { x: number; width: number; rules: number }[];
  narrowest: number;
  stepRules: number;
  /** Every dashed VERTICAL rule: its x, and the y range it spans. */
  steps: { x: number; y1: number; y2: number; width: number; opacity: number; dash: string }[];
  /** The horizontal boundary rules, as x extents plus whether they are dashed. */
  boundaries: { x1: number; x2: number; dashed: boolean }[];
  /** The plot area itself, for "does the rule run its full height". */
  plot: { x: number; y: number; width: number; height: number };
  /** The axis-side boundary labels: the value, its x, and which kind it is. */
  boundLabels: { text: string; x: number; kind: string }[];
  /** Anything FILLED. Must be empty — see property 5. */
  filledRegions: number;
  /** The trend line's own gradient: one stop per point, in that point's status colour. */
  lineStops: string[];
  /** The line's stroke width, which went to 5 when the bands went. */
  lineWidth: number;
}

async function chartGeometry(page: Page): Promise<ChartGeometry> {
  return page.evaluate(() => {
    const svg = document.querySelector('.recharts-surface') as SVGSVGElement;
    const lines = [...svg.querySelectorAll('.recharts-reference-line line')] as SVGLineElement[];
    const num = (el: SVGLineElement, a: string) => Number(el.getAttribute(a));

    /**
     * THE PERIODS COME OFF THE BOUNDARY RULES NOW, not off band rects.
     *
     * Every rule in a period is drawn to that period's own x1/x2 (see
     * `bandSegments` in TrendChart), so grouping the horizontal rules by exact
     * extent gives exactly what grouping the rects used to: one entry per
     * period, and a rule that landed anywhere of its own shows up as an extra
     * group with a partial count.
     */
    const horizontal = lines.filter((l) => Math.abs(num(l, 'y1') - num(l, 'y2')) < 0.5);
    const byExtent = new Map<string, { x: number; width: number; rules: number }>();
    for (const l of horizontal) {
      const x = Math.round(Math.min(num(l, 'x1'), num(l, 'x2')));
      const width = Math.round(Math.abs(num(l, 'x2') - num(l, 'x1')));
      const key = `${x}:${width}`;
      const entry = byExtent.get(key) ?? { x, width, rules: 0 };
      entry.rules += 1;
      byExtent.set(key, entry);
    }
    const periods = [...byExtent.values()].sort((a, b) => a.x - b.x);

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

    const boundaries = horizontal.map((l) => ({
      x1: Math.round(Math.min(num(l, 'x1'), num(l, 'x2'))),
      x2: Math.round(Math.max(num(l, 'x1'), num(l, 'x2'))),
      dashed: (l.getAttribute('stroke-dasharray') ?? '') !== '',
    }));

    // Recharts does not expose the plot rect in the DOM, so it is taken from the
    // x-axis line's own extent.
    const axis = svg.querySelector('.recharts-xAxis .recharts-cartesian-axis-line') as SVGLineElement | null;
    const plot = {
      x: axis ? Math.round(num(axis, 'x1')) : 0,
      y: 0,
      width: axis ? Math.round(num(axis, 'x2') - num(axis, 'x1')) : 0,
      height: axis ? Math.round(num(axis, 'y1')) : 0,
    };

    /**
     * ANYTHING FILLED. `ReferenceArea` is how a band was drawn, `<rect>` is how
     * the plot panel and the optimal narrowing were, and the count of all of
     * them has to be zero. Counted rather than asserted-absent by selector so a
     * failure says HOW MANY came back.
     */
    const filledRegions =
      svg.querySelectorAll('.recharts-reference-area-rect').length +
      [...svg.querySelectorAll('rect')]
        // A rect inside <defs> or a <clipPath> is a DEFINITION and is never
        // painted — Recharts emits exactly one, its plot clip.
        .filter((r) => !r.closest('defs') && !r.closest('clipPath'))
        .filter((r) => {
          const fill = r.getAttribute('fill') ?? '';
          // Recharts draws its own transparent hit-target rects; a fill of
          // none or transparent is not a filled region.
          return fill !== '' && fill !== 'none' && fill !== 'transparent';
        }).length;

    // The line's gradient — one stop per point, plus the two end stops and any
    // boundary-crossing hinges.
    const gradient = svg.querySelector('linearGradient[id^="status-line-"]');
    const lineStops = gradient
      ? [...gradient.querySelectorAll('stop')].map((st) => st.getAttribute('stop-color') ?? '')
      : [];
    const curve = svg.querySelector('.recharts-line-curve') as SVGPathElement | null;

    const boundLabels = ([...svg.querySelectorAll('g[data-boundary-label]')] as SVGGElement[]).map((g) => {
      const text = g.querySelector('text');
      return {
        text: text?.textContent ?? '',
        x: Math.round(Number(text?.getAttribute('x') ?? 0)),
        kind: g.getAttribute('data-boundary-label') ?? '',
      };
    });

    return {
      plotWidth: periods.reduce((total, p) => total + p.width, 0),
      periods,
      narrowest: periods.length > 0 ? Math.min(...periods.map((p) => p.width)) : 0,
      stepRules: steps.length,
      steps,
      boundaries,
      plot,
      boundLabels,
      filledRegions,
      lineStops,
      lineWidth: curve ? Number(curve.getAttribute('stroke-width')) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// THE STEPPED FIXTURE.
//
// Two reports for one patient, one marker, two reference ranges. Everything
// about the step this file measures — the period extents, the dashed rule, the
// key entry, the sentence, the two label columns — comes from these numbers,
// so a failure names a range rather than "whichever marker the seed drifted".
// ---------------------------------------------------------------------------

const STEP_FIXTURE = {
  /**
   * The two ranges, and the values read against them. The RANGES are the
   * fixture — the marker they are attached to is only a carrier, so it is the
   * first matched analyte on the sample report rather than a name typed in
   * here that the report may or may not contain.
   */
  first: { sampleDate: '2025-02-01', value: 88, low: 30, high: 400 },
  second: { sampleDate: '2026-02-01', value: 18, low: 20, high: 200 },
} as const;

const SAMPLE_REPORT = fileURLToPath(
  new URL('../apps/server/src/modules/randox/specs/HSC5-Randox-Basic-Screen-Example-Report.pdf', import.meta.url),
);

async function signInAs(request: APIRequestContext, email: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

/**
 * One patient, two released reports, one marker whose reference range changes
 * between them. Returns the marker to plot and how to sign in as its patient.
 */
async function buildSteppedSeries(ctx: BrowserContext) {
  const admin = ctx.request;
  await signInAs(admin, 'admin@aspireshield.dev', process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!');
  const csrf = (await admin.storageState()).cookies.find((c) => c.name === 'csrf_token')?.value ?? '';
  const email = `e2e-step-${Date.now()}@example.com`;
  const password = 'SteppedRange123!';

  const invite = await (
    await admin.post('/api/auth/invite', { data: { email }, headers: { 'X-CSRF-Token': csrf } })
  ).json();
  await admin.post('/api/auth/activate', {
    data: {
      inviteToken: new URL(invite.devActivationUrl).searchParams.get('token'),
      password,
      profile: { firstName: 'Step', lastName: 'Patient', sex: 'FEMALE', dob: '1985-05-05', contactNumber: '+44 7000 555666' },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });
  const sources = await (await admin.get('/api/panels/sources')).json();
  const source = sources.find((s: { key: string }) => s.key === 'randox_portal') ?? sources[0];

  let markerId = '';
  let unit = '';
  let markerName = '';
  for (const draw of [STEP_FIXTURE.first, STEP_FIXTURE.second]) {
    const created = await (
      await admin.post('/api/reports', {
        multipart: {
          patientId: invite.userId,
          sourceId: source.id,
          sampleDate: draw.sampleDate,
          file: { name: 'hsc5.pdf', mimeType: 'application/pdf', buffer: readFileSync(SAMPLE_REPORT) },
        },
        headers: { 'X-CSRF-Token': csrf },
      })
    ).json();
    const rows = created.parse.rows as {
      rawName: string;
      matchedMarkerId?: string;
      value?: number;
      resultText?: string;
      unit: string;
      referenceLow?: number;
      referenceHigh?: number;
    }[];
    // The first matched analyte with a two-sided range, in document order — so
    // it is the same marker on both reports without naming one the sample
    // report might not carry.
    const target = rows.find(
      (r) => r.matchedMarkerId && r.referenceLow != null && r.referenceHigh != null && typeof r.value === 'number',
    );
    expect(target, 'the sample report should carry a numeric analyte with a two-sided range').toBeTruthy();
    markerId = target!.matchedMarkerId!;
    unit = target!.unit;
    markerName = target!.rawName;

    const publish = await admin.post(`/api/reports/${created.id}/publish`, {
      data: {
        sampleDate: `${draw.sampleDate}T00:00:00.000Z`,
        confirm: true,
        results: rows
          .filter((r) => r.matchedMarkerId && r.referenceLow != null && r.referenceHigh != null)
          .map((r) =>
            r.matchedMarkerId === markerId
              ? { markerId, value: draw.value, unit, referenceLow: draw.low, referenceHigh: draw.high }
              : {
                  markerId: r.matchedMarkerId!,
                  value: r.value ?? r.resultText,
                  unit: r.unit,
                  referenceLow: r.referenceLow!,
                  referenceHigh: r.referenceHigh!,
                },
          ),
      },
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(publish.ok(), await publish.text()).toBeTruthy();
  }
  return { id: markerId, name: markerName, email, password };
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

test('a series on one reference range gets one full-width set of boundary rules', async ({ browser }) => {
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

    const geometry = await chartGeometry(page);
    expect(geometry.periods.length, `${marker.name}: one range means one extent`).toBe(1);
    // FOUR RULES: two reference bounds and two significantly-out thresholds.
    // A marker whose thresholds fall outside the y domain draws fewer, so this
    // is a floor rather than an equality — but both BOUNDS are always in view,
    // because the domain is built to contain the reference range.
    expect(geometry.periods[0].rules, `${marker.name}: the boundary rules`).toBeGreaterThanOrEqual(2);
    // Nothing to step over, so nothing says a range changed.
    expect(geometry.stepRules, `${marker.name}: no step rule on a stable range`).toBe(0);
    await expect(page.getByText('The lab’s reference range changed during this period')).toHaveCount(0);

    // ── 5. NOTHING IS FILLED ───────────────────────────────────────────────
    // The instruction is "no filled regions, no coloured background, no tinted
    // areas of any kind". The five band rects, the optimal narrowing and the
    // inset plot panel were all `<rect>`s with a fill, and this is the check
    // that none of them has come back — which a screenshot review is
    // particularly bad at, because a faint band looks like a rendering artefact.
    expect(geometry.filledRegions, `${marker.name}: the chart draws ${geometry.filledRegions} filled regions`).toBe(0);

    // ── 6. THE LINE CARRIES THE STATUS ─────────────────────────────────────
    // With nothing behind it, the line is the only thing on the plot that says
    // anything. A gradient with fewer than three stops is a flat line: two end
    // stops and nothing between them.
    expect(
      geometry.lineStops.length,
      `${marker.name}: the trend line's gradient has ${geometry.lineStops.length} stops`,
    ).toBeGreaterThanOrEqual(3);
    for (const stop of geometry.lineStops) {
      // A BARE `var(--x)` in an SVG stop is not a colour: the browser drops it
      // silently and the stroke renders black. That mistake is what made the
      // whole status layer invisible once, and it is invisible in code review.
      expect(stop, `${marker.name}: "${stop}" is not a resolved colour`).toMatch(/^(#|rgb)/);
    }
    expect(geometry.lineWidth, `${marker.name}: the line's weight`).toBe(5);

    // ── 7. EVERY BOUNDARY IS LABELLED, AND THE TWO KINDS ARE TOLD APART ────
    // The rules are now the only thing saying where the range is, so each
    // carries its own value on the axis. Bounds and thresholds are
    // distinguished by a solid lead rule against a dashed one — never by hue.
    const kinds = new Set(geometry.boundLabels.map((l) => l.kind));
    expect(kinds.has('bound'), `${marker.name}: the reference bounds are labelled`).toBe(true);
    for (const label of geometry.boundLabels) {
      // A converted range arrives with no rounding of its own and once printed
      // 5.494444506110488 beside the plot.
      expect(
        label.text.length,
        `${marker.name}: "${label.text}" is a raw float, not a reference bound`,
      ).toBeLessThanOrEqual(7);
    }
    // Solid for a bound, dashed for a threshold — as drawn, not as intended.
    const dashedCount = geometry.boundaries.filter((b) => b.dashed).length;
    const solidCount = geometry.boundaries.filter((b) => !b.dashed).length;
    expect(solidCount, `${marker.name}: the two reference bounds are drawn solid`).toBe(2);
    expect(
      dashedCount,
      `${marker.name}: a threshold rule in view is drawn dashed (${dashedCount} of ${geometry.boundaries.length})`,
    ).toBe(geometry.boundaries.length - 2);
  }
  await ctx.close();
});

test('a series whose reference range changes steps, and says so', async ({ browser }) => {
  test.setTimeout(240_000);
  /**
   * THE STEPPED SERIES IS BUILT, NOT BORROWED (Aug 2026).
   *
   * This used to read the demo patient for a marker whose range happened to
   * change. The demo deliberately has none now — one reference range per
   * marker, for the whole of a patient's history, because a step drawn over a
   * change that never happened is noise in the artefact used to show the
   * product to people. So the fixture is made here: one patient, two reports,
   * one marker measured against 2–25 and then against 2–10.
   *
   * That is a better test than the one it replaces, and not only because the
   * demo stopped supplying one. `changing[0]` was whichever marker the seed
   * happened to drift, so the numbers this measured were not written down
   * anywhere; these are.
   */
  const adminCtx = await browser.newContext();
  const marker = await buildSteppedSeries(adminCtx);
  await adminCtx.close();

  const ctx = await browser.newContext();
  await signInAs(ctx.request, marker.email, marker.password);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/markers/${marker.id}`);
  await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);

  const geometry = await chartGeometry(page);

  // Stepped: more than one period.
  expect(geometry.periods.length, `${marker.name}: a changed range is drawn as separate periods`).toBeGreaterThan(1);

  // AND NONE OF THEM IS A SLIVER. This is the assertion the whole file is for,
  // and it is unchanged by the bands' removal: the periods are still periods,
  // and a 24px one is still the failure — it is now measured on the boundary
  // rules, which are drawn to the same extents the rects were.
  for (const period of geometry.periods) {
    const share = period.width / geometry.plotWidth;
    expect(
      share,
      `${marker.name}: a period ${period.width}px wide on a ${geometry.plotWidth}px plot is a sliver`,
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

  // 1. EVERY RULE STEPS TOGETHER. The periods are grouped by exact x-extent, so
  //    one rule landing anywhere of its own shows up as an extra period with a
  //    partial count. Every period carries the same number.
  const ruleCounts = [...new Set(geometry.periods.map((p) => p.rules))];
  expect(ruleCounts, `${marker.name}: the rules do not all share their period's extent`).toHaveLength(1);
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

  // 4. EVERY BOUNDARY RULE STAYS IN ITS OWN PERIOD and meets the step cleanly.
  //    A rule spanning the whole plot would draw the old range's edge across
  //    the new range's territory. There is no exception any more: the optimal
  //    narrowing used to span the plot by design and has been removed with the
  //    other filled regions, so EVERY horizontal rule must match a period.
  const extents = geometry.periods.map((p) => ({ x1: p.x, x2: p.x + p.width }));
  for (const line of geometry.boundaries) {
    const fits = extents.some((e) => Math.abs(e.x1 - line.x1) <= 1 && Math.abs(e.x2 - line.x2) <= 1);
    expect(fits, `${marker.name}: a boundary rule runs ${line.x1}–${line.x2}, which is no period`).toBe(true);
  }

  // 4b. AND NOTHING IS FILLED, on the stepped chart as on the stable one.
  expect(geometry.filledRegions, `${marker.name}: the chart draws ${geometry.filledRegions} filled regions`).toBe(0);

  // 5. BOTH RANGES ARE LABELLED. Each period's bounds are printed at the right
  //    hand end of its own extent, so the reader can see what the range stepped
  //    FROM without going to the sentence. Two periods, two bounds each.
  const boundOnly = geometry.boundLabels.filter((l) => l.kind === 'bound');
  expect(
    boundOnly.length,
    `${marker.name}: expected a label per period bound, got ${JSON.stringify(geometry.boundLabels)}`,
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
