import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * The traffic-light layer, checked on a real seeded report rather than by eye.
 *
 * "Status colour is not rendering" is the specific failure this exists to
 * catch, and it is a failure a unit test structurally cannot see: the tokens
 * can be correct, the class names can be correct, and the wash can still be
 * invisible because a components-layer rule wins over it or because the value
 * is so faint it lands on the card colour. So this reads the COMPUTED style off
 * live cards and asserts that the five states resolve to five different, and
 * actually coloured, backgrounds — in both themes.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function loginAsDemoPatient(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'demo patient could not complete 2FA').toBeTruthy();
}

/** rgb(r, g, b) → [r,g,b]. */
function rgb(value: string): [number, number, number] {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) throw new Error(`not an rgb colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** How far off neutral grey a colour is. A wash that measures 0 here is not a wash. */
function chroma(value: string): number {
  const [r, g, b] = rgb(value);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Which of the three hues a wash reads as, from the channel ordering alone. */
function hueOf(value: string): 'green' | 'yellow' | 'red' | 'neutral' {
  const [r, g, b] = rgb(value);
  if (chroma(value) < 4) return 'neutral';
  if (g > r && g > b) return 'green';
  if (r > g && g > b) return r - g > (g - b) * 1.6 ? 'red' : 'yellow';
  if (r > g && r > b) return 'red';
  return 'neutral';
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('aspire-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

/** The newest report with a full spread of states — the Signature panel. */
async function openBiggestReport(page: Page, request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/patient/reports');
  const reports = (await res.json()) as { reportId: string; markerCount: number; patientStatus: string }[];
  const biggest = reports
    .filter((r) => r.patientStatus === 'RELEASED')
    .sort((a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0))[0];
  expect(biggest, 'the demo patient has no released reports — run the demo seed').toBeTruthy();
  return biggest.reportId;
}

test.describe('traffic-light status', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`all five states render a distinct, genuinely coloured wash in ${theme} mode`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await loginAsDemoPatient(ctx.request);
      const page = await ctx.newPage();
      const reportId = await openBiggestReport(page, ctx.request);

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/reports/${reportId}`);
      await page.waitForSelector('text=This report at a glance');

      /**
       * ── MEASURED ON THE RESULT CARDS, NOT ON THE COUNTS STRIP (Aug 2026) ──
       *
       * This used to read the strip, on the reasoning that it is the one place
       * all five states appear together and can be compared. That stopped
       * being true: the strip folds to THREE segments now — below range, in
       * range, above range — with significantly-out counted into its neighbour.
       *
       * The five states themselves are untouched, and the cards are where they
       * live. So the washes are read off the marker cards, which is also the
       * surface a patient actually reads a status on: `Card`'s `tint` prop is
       * what `statusTintClass` paints, and it is the thing this spec exists to
       * stop turning into beige.
       *
       * Each card carries its status in words, so the label and the wash are
       * read off the SAME element and cannot be matched up wrongly.
       */
      const washes = await page.evaluate(() => {
        const out: { label: string; bg: string }[] = [];
        for (const card of [...document.querySelectorAll('.card')]) {
          const status = [...card.querySelectorAll('span')]
            .map((s) => (s.textContent ?? '').trim())
            .find((t) =>
              ['In range', 'Above range', 'Below range', 'Significantly above range', 'Significantly below range'].includes(
                t,
              ),
            );
          if (!status) continue;
          out.push({ label: status, bg: getComputedStyle(card).backgroundColor });
        }
        return out;
      });
      expect(washes.length, 'expected tinted result cards on the report').toBeGreaterThan(0);

      const seen = new Map<string, string>();
      for (const { label, bg } of washes) {
        // The failure mode this whole spec exists for: a wash that is
        // indistinguishable from the untinted card it replaces.
        expect(chroma(bg), `${theme}: "${label}" wash ${bg} has no colour in it`).toBeGreaterThanOrEqual(4);
        seen.set(label, bg);
      }

      // Five states, THREE colours, on purpose: above and below share yellow,
      // and significantly-above and significantly-below share red. Direction is
      // carried by the chevron and by the word, never by hue — so a test that
      // demanded five distinct colours would be demanding a regression.
      const distinct = new Set(seen.values());
      expect(distinct.size, `${theme}: expected three hues, got ${distinct.size}`).toBe(3);

      // And the right three: in range reads green, above/below read yellow,
      // significantly out reads red.
      for (const [label, bg] of seen) {
        const expected = label.includes('Significantly')
          ? 'red'
          : label.includes('In range')
            ? 'green'
            : 'yellow';
        expect(hueOf(bg), `${theme}: "${label}" wash ${bg} reads as ${hueOf(bg)}, expected ${expected}`).toBe(expected);
      }
      // All three are actually on screen — a report showing only in-range
      // results would pass every check above while proving nothing.
      expect(
        new Set(
          [...seen.keys()].map((l) => (l.includes('Significantly') ? 'red' : l.includes('In range') ? 'green' : 'yellow')),
        ).size,
      ).toBe(3);

      /**
       * ── AND THE STRIP ITSELF IS THREE, WHICH IS THE NEW FACT ──────────────
       *
       * Below range · In range · Above range, and the two gold segments are
       * THE SAME COLOUR — direction is the chevron and the word. A segment
       * nobody is in is not shown, so this is a ceiling rather than an
       * equality: what may never happen is a fourth.
       */
      const segments = page.locator('p.eyebrow:has-text("This report at a glance") + ul li button');
      const segmentCount = await segments.count();
      expect(segmentCount, `${theme}: the at-a-glance strip has ${segmentCount} segments`).toBeLessThanOrEqual(3);
      expect(segmentCount, `${theme}: the strip shows nothing at all`).toBeGreaterThan(0);
      const segmentLabels: string[] = [];
      const segmentWashes = new Map<string, string>();
      for (let i = 0; i < segmentCount; i += 1) {
        const label = (await segments.nth(i).innerText()).replace(/\s+/g, ' ').trim();
        segmentLabels.push(label);
        segmentWashes.set(label, await segments.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor));
      }
      for (const label of segmentLabels) {
        expect(
          label.includes('Significantly'),
          `${theme}: the strip segment "${label}" names a significantly-out state; the strip folds those in`,
        ).toBe(false);
      }
      const above = [...segmentWashes.entries()].find(([l]) => l.includes('Above range'))?.[1];
      const below = [...segmentWashes.entries()].find(([l]) => l.includes('Below range'))?.[1];
      if (above && below) {
        expect(above, `${theme}: the two gold segments are different colours`).toBe(below);
      }

      await ctx.close();
    });

    test(`the trend chart carries status on the LINE, with no filled regions, in ${theme} mode`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await loginAsDemoPatient(ctx.request);
      const page = await ctx.newPage();

      const res = await ctx.request.get('/api/patient/markers');
      const markers = (await res.json()) as {
        markerId: string;
        name: string;
        resultType?: string;
        resultCount: number;
        referenceLow: number;
        referenceHigh: number;
      }[];
      // A marker with real history, so there is a line to carry anything.
      const withHistory = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2);
      expect(withHistory.length, 'no marker has more than one result — run the demo seed').toBeGreaterThan(0);
      const marker = withHistory[0];

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/markers/${marker.markerId}`);
      await page.waitForSelector('text=Trend over time');
      await page.waitForTimeout(900);

      /**
       * ═══ WHAT THIS TEST USED TO BE, AND WHY IT HAD TO BE REWRITTEN ═══════
       *
       * It measured the five band rects: that each was painted at exactly
       * fill-opacity 1, that every gradient stop inside them was one of the
       * five `--c-hue-*-fill` tokens, and that both hinges were named by the
       * bands either side of them. That check had followed the implementation
       * three times and each version caught something real — most recently
       * Recharts' `ReferenceArea` defaulting `fillOpacity` to 0.5, which drew
       * every band at half strength and turned the whole plot beige while the
       * key, the boundary lines and the tokens were all perfectly correct.
       *
       * THE BANDS ARE GONE (Aug 2026). Every one of those assertions is now a
       * fact about something that is not drawn, so the file would go on passing
       * while measuring nothing. The property they protected — "the status
       * layer is actually painted, in the actual token colours, and has not
       * silently flattened to one beige" — is protected here on the thing that
       * carries it now: the LINE.
       *
       * Three claims, and the first is the one a screenshot review cannot make.
       */

      // ── 1. NOTHING IS FILLED ────────────────────────────────────────────
      // "No filled regions, no coloured background, no tinted areas of any
      // kind." A faint band is indistinguishable from a rendering artefact by
      // eye, which is exactly why this is a count and not a look.
      const filled = await page.evaluate(() => {
        const svg = document.querySelector('.recharts-surface');
        if (!svg) return -1;
        const areas = svg.querySelectorAll('.recharts-reference-area-rect').length;
        const rects = [...svg.querySelectorAll('rect')]
          // A rect inside <defs> or a <clipPath> is a DEFINITION and is never
          // painted. Recharts emits exactly one — its plot clip — with no fill
          // attribute at all, which computes to black and would otherwise be
          // counted as a filled region every time. That is a real trap rather
          // than a nuisance: excluded by WHERE it sits rather than by its size,
          // because a band rect and a clip rect are the same size by design.
          .filter((r) => !r.closest('defs') && !r.closest('clipPath'))
          .filter((r) => {
            const fill = getComputedStyle(r as SVGElement).fill;
            return fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)';
          }).length;
        return areas + rects;
      });
      expect(filled, `${theme}: the trend chart paints ${filled} filled regions; it must paint none`).toBe(0);

      // ── 2. THE LINE IS PAINTED IN THE STATUS TOKENS, AND NOTHING ELSE ────
      // Read off the document's own custom properties rather than transcribed,
      // so a re-solve of the line colours does not have to be copied into a
      // spec file to keep it passing. The five are the three states plus the
      // two hinges the line crosses a boundary in.
      const ladder = await page.evaluate(() =>
        ['green', 'olive', 'yellow', 'orange', 'red'].map((h) => ({
          hue: h,
          channels: getComputedStyle(document.documentElement).getPropertyValue(`--c-hue-${h}-mark`).trim(),
        })),
      );
      const asRgb = (channels: string) => `rgb(${channels.split(/\s+/).join(', ')})`;
      const ALLOWED = new Map(ladder.map((l) => [asRgb(l.channels), l.hue]));

      const line = await page.evaluate(() => {
        const svg = document.querySelector('.recharts-surface');
        // THE CORE LINE BY NAME — the glow is three wider strokes of the same
        // path underneath it (see SPARK in tokens.ts), so a bare
        // `.recharts-line-curve` measures the outermost casing's 21px and its
        // glow gradient rather than the line's own 5px.
        const curve = svg?.querySelector('.trend-line-core .recharts-line-curve') as SVGPathElement | null;
        const stroke = curve ? getComputedStyle(curve).stroke : '';
        const id = /url\(["']?#([^"')]+)/.exec(stroke)?.[1] ?? null;
        const gradient = id ? document.getElementById(id) : null;
        return {
          width: curve ? Number(getComputedStyle(curve).strokeWidth.replace('px', '')) : 0,
          gradientId: id,
          stops: gradient ? [...gradient.querySelectorAll('stop')].map((st) => getComputedStyle(st).stopColor) : [],
        };
      });

      // A flat stroke is the failure: the line has to be a gradient, or the
      // status is not on it at all.
      expect(line.gradientId, `${theme}: the trend line is not painted with a gradient`).not.toBeNull();
      expect(line.stops.length, `${theme}: the line's gradient has ${line.stops.length} stops`).toBeGreaterThanOrEqual(3);
      for (const stop of line.stops) {
        expect(
          ALLOWED.has(stop),
          `${theme}: the line carries ${stop}, which is not one of the five status colours ` +
            `(${[...ALLOWED.keys()].join(', ')}).`,
        ).toBe(true);
      }
      // THICKER THAN IT WAS. The line is the whole chart now and is carrying a
      // colour that changes along its length; at 4px that change is unreadable.
      expect(line.width, `${theme}: the trend line is ${line.width}px`).toBeGreaterThanOrEqual(5);

      // ── 3. THE FOUR BOUNDARY RULES ARE THERE, AT TWO WEIGHTS ────────────
      // With nothing filled, these are the only thing saying where the range
      // is — and a reference bound has to be tellable from a significantly-out
      // threshold WITHOUT colour, which is the dash.
      const rules = await page.evaluate(() => {
        const svg = document.querySelector('.recharts-surface');
        const lines = [...(svg?.querySelectorAll('.recharts-reference-line line') ?? [])] as SVGLineElement[];
        return lines
          .filter((l) => Math.abs(Number(l.getAttribute('y1')) - Number(l.getAttribute('y2'))) < 0.5)
          .map((l) => ({
            dashed: (l.getAttribute('stroke-dasharray') ?? '') !== '',
            stroke: getComputedStyle(l).stroke,
          }));
      });
      expect(rules.filter((r) => !r.dashed).length, `${theme}: the two reference bounds are solid`).toBe(2);
      // Neutral, never a status hue: the boundary is furniture and the reader's
      // own result is not. Every rule is the same colour as every other.
      expect(new Set(rules.map((r) => r.stroke)).size, `${theme}: the boundary rules are not one colour`).toBe(1);
      for (const rule of rules) {
        expect(
          ALLOWED.has(rule.stroke),
          `${theme}: a boundary rule is painted ${rule.stroke}, which is a status colour`,
        ).toBe(false);
      }

      // ── 4. THE POINTS ARE LIT, UNIFORMLY, AT THIS THEME'S OWN STRENGTH ──
      /**
       * Every point is a SPARK — a white core inside a radial falloff,
       * IDENTICAL AT EVERY STATUS, brightest on the most recent — and the line
       * carries a casing of its own status light along its length. Four things
       * about that fail SILENTLY, which is why they are measured rather than
       * looked at:
       *
       *  · THE CUSTOM PROPERTY NOT RESOLVING. The strength arrives as
       *    `fill-opacity: var(--chart-spark)`, and an opacity that fails to
       *    resolve does not fall back to anything sensible — it computes to 1,
       *    so a missing variable paints a SOLID disc of status colour behind
       *    every point. That is the loud version; the quiet one is a variable
       *    emitted in one theme and not the other, which is why this is read
       *    off the document per theme rather than transcribed into this file.
       *  · THE HALO VARYING BY STATUS. Every point is one white spark now: the
       *    chevrons and the per-status fills came off this chart (Aug 2026) and
       *    are not to come back. There is ONE gradient in the document and every
       *    point references it — which is asserted below, because "we deleted
       *    the five" is a claim about a moment and "there is one" is a claim
       *    about the render.
       *  · A HALO THAT DOES NOT REACH NOTHING. A ramp ending above zero ends at
       *    an EDGE, which is the flat 13px disc this replaced — a dot inside a
       *    ring rather than a point that is lit.
       *  · THE CASING OVERTAKING THE LINE. It is drawn as wider strokes of the
       *    same path, so "wider, and never as strong" is the whole of what makes
       *    it a glow rather than a second line.
       */
      const spark = await page.evaluate(() => {
        const svg = document.querySelector('.recharts-surface') as SVGSVGElement;
        const root = getComputedStyle(document.documentElement);
        const halos = [...svg.querySelectorAll('circle')].filter((c) =>
          (c.getAttribute('fill') ?? '').startsWith('url(#spark-'),
        );
        const core = svg.querySelector('.trend-line-core .recharts-line-curve') as SVGPathElement | null;
        return {
          declared: {
            latest: Number(root.getPropertyValue('--chart-spark')),
            past: Number(root.getPropertyValue('--chart-spark-past')),
            glow: Number(root.getPropertyValue('--chart-line-glow')),
          },
          // The applied strengths in document order — the last point is the
          // most recent, and is the one that should be brightest.
          applied: halos.map((c) => Number(getComputedStyle(c).fillOpacity)),
          gradients: halos.map((c) => {
            const id = /url\(["']?#([^"')]+)/.exec(c.getAttribute('fill') ?? '')?.[1] ?? '';
            const stops = [...(document.getElementById(id)?.querySelectorAll('stop') ?? [])];
            return {
              id,
              colours: [...new Set(stops.map((s) => getComputedStyle(s).stopColor))],
              rim: stops.length ? Number(getComputedStyle(stops[stops.length - 1]).stopOpacity) : 1,
            };
          }),
          coreWidth: core ? Number(getComputedStyle(core).strokeWidth.replace('px', '')) : 0,
          casings: [...svg.querySelectorAll('.recharts-line-curve')]
            .filter((p) => p !== core)
            .map((p) => ({
              width: Number(getComputedStyle(p).strokeWidth.replace('px', '')),
              // The layer's own share; the theme's alpha is in the gradient it
              // is painted with, and the two multiply.
              share: Number(getComputedStyle(p).strokeOpacity),
              stop: Number(
                getComputedStyle(
                  document
                    .getElementById(/url\(["']?#([^"')]+)/.exec(getComputedStyle(p).stroke)?.[1] ?? '')
                    ?.querySelector('stop') as Element,
                ).stopOpacity,
              ),
            })),
        };
      });

      expect(spark.applied.length, `${theme}: the chart draws ${spark.applied.length} lit points`).toBeGreaterThan(1);
      // Emitted at all, and never 1 — see what a missing custom property paints.
      for (const [name, value] of Object.entries(spark.declared)) {
        expect(value, `${theme}: --chart-${name} did not resolve to a number`).toBeGreaterThan(0);
        expect(value, `${theme}: --chart-${name} is ${value}, which is a fill rather than a glow`).toBeLessThan(1);
      }
      // THE MOST RECENT POINT SPARKS BRIGHTEST — it is the one the reader came
      // for — and the rest are lit at one quieter strength. A difference in
      // DEGREE, never in kind: on a chart whose marks differ in kind where the
      // difference is clinical, a halo on one point of five would read as a
      // fifth kind of mark.
      const latest = spark.applied[spark.applied.length - 1];
      expect(latest, `${theme}: the latest point is lit at ${latest}`).toBeCloseTo(spark.declared.latest, 3);
      for (const past of spark.applied.slice(0, -1)) {
        expect(past, `${theme}: an earlier point is lit at ${past}`).toBeCloseTo(spark.declared.past, 3);
        expect(past, `${theme}: an earlier point out-sparks the latest one`).toBeLessThan(latest);
      }
      /**
       * ── EVERY POINT IS THE SAME SPARK, AND NONE OF THEM IS A STATUS COLOUR
       *
       * Three claims, and the first is the one this change was about: there is
       * exactly ONE spark gradient in the document and every point references
       * it. Five gradients would mean the halo is indexed by status again,
       * which is the same fact the line already carries at that exact x.
       *
       * The falloff is in the ALPHA, so one colour per gradient — two would be
       * a hue changing across one point. And the ramp reaches nothing at its
       * rim: a gradient ending above zero ends at an EDGE, which is a dot
       * inside a ring rather than a point that is lit.
       */
      const ids = new Set(spark.gradients.map((g) => g.id));
      expect(ids.size, `${theme}: the chart holds ${ids.size} spark gradients — every point is the same spark`).toBe(1);
      for (const gradient of spark.gradients) {
        expect(gradient.colours.length, `${theme}: ${gradient.id} carries ${gradient.colours.join(', ')}`).toBe(1);
        expect(
          ALLOWED.has(gradient.colours[0]),
          `${theme}: a point sparks in ${gradient.colours[0]}, which is a status colour — the points are uniform`,
        ).toBe(false);
        expect(gradient.rim, `${theme}: a halo ends at ${gradient.rim} rather than at nothing`).toBe(0);
      }
      /**
       * AND THE CHART DRAWS NO SHAPES. The level dot, the chevron and the
       * doubled chevron are off this chart entirely; three kinds of mark on one
       * line was noise saying what the line says in colour along its own length.
       * A `<polygon>` inside the plot is the shape layer coming back — it is
       * the element every one of those marks was made of.
       */
      const polygons = await page.evaluate(
        () => document.querySelectorAll('.recharts-surface polygon').length,
      );
      expect(polygons, `${theme}: the plot draws ${polygons} polygons — the status shapes are back`).toBe(0);
      // THE CASING IS WIDER THAN THE LINE AND NEVER AS STRONG, every layer.
      expect(spark.casings.length, `${theme}: the line carries ${spark.casings.length} casing strokes`).toBe(3);
      for (const casing of spark.casings) {
        expect(
          casing.width,
          `${theme}: a casing is ${casing.width}px against the line's ${spark.coreWidth}`,
        ).toBeGreaterThan(spark.coreWidth);
        // What lands on the card is the layer's share TIMES the theme's alpha,
        // and it is that product a reader sees.
        expect(
          casing.share * casing.stop,
          `${theme}: a casing layer paints at ${(casing.share * casing.stop).toFixed(3)}`,
        ).toBeLessThan(0.2);
        expect(casing.stop, `${theme}: a casing's gradient did not take the theme's alpha`).toBeCloseTo(
          spark.declared.glow,
          3,
        );
      }

      await ctx.close();
    });
  }

  /**
   * The mark on the range bar is NO LONGER the status colour, and this test's
   * name used to say it was.
   *
   * It is the rangemark token now — white in dark, espresso in light, always
   * inside the opposite ring — because a mark drawn in its own state's colour
   * is a mark drawn in the shade of the segment it is standing on: a green dot
   * on the green band, pale gold on the gold one. Its job is POSITION.
   *
   * Nothing about the status layer is weakened by that, which is what this
   * checks: the status is still stated in words on the bar's own accessible
   * label, and the segment, the chevron and the card's wash still carry it
   * three more times over.
   */
  test('the range bar states the value, the range and the status in words', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    // Overview lists out-of-range results, each with a range bar under it.
    const bar = page.locator('[role="img"][aria-label*="reference range"]').first();
    await expect(bar).toBeVisible();
    const label = await bar.getAttribute('aria-label');
    expect(label, 'the range bar must state the value, the range and the status in words').toMatch(/status:/i);

    await ctx.close();
  });
});
