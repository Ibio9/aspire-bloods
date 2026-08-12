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

      // The counts strip carries one tile per state present, each with the
      // state's own wash — so it is the one place all five are on screen
      // together and can be compared against each other.
      // Scoped to the strip itself: the category summary bars below it are the
      // same shape of button and would otherwise be swept in, and those are
      // deliberately untinted (the tint is inside them, on the bar segments).
      const tiles = page.locator('p.eyebrow:has-text("This report at a glance") + ul li button');
      const count = await tiles.count();
      expect(count, 'expected the counts strip to show several states').toBeGreaterThanOrEqual(4);

      const seen = new Map<string, string>();
      for (let i = 0; i < count; i += 1) {
        const tile = tiles.nth(i);
        const label = (await tile.innerText()).replace(/\s+/g, ' ').trim();
        const bg = await tile.evaluate((el) => getComputedStyle(el).backgroundColor);

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
      expect(new Set([...seen.keys()].map((l) => (l.includes('Significantly') ? 'red' : l.includes('In range') ? 'green' : 'yellow'))).size).toBe(3);

      await ctx.close();
    });

    test(`the trend chart draws bands derived from the result’s own range in ${theme} mode`, async ({ browser }) => {
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
      // A marker with real history, so there is a line as well as bands.
      const withHistory = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2);
      expect(withHistory.length, 'no marker has more than one result — run the demo seed').toBeGreaterThan(0);
      const marker = withHistory[0];

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/markers/${marker.markerId}`);
      await page.waitForSelector('text=Trend over time');

      // ─────────────────────────────────────────────────────────────────
      // FIVE BANDS, EACH PAINTED AT ITS OWN WEIGHT — AND THE WEIGHT MOVED
      // BACK INTO THE GRADIENT STOPS (rewritten again, Aug 2026).
      //
      // The history is worth keeping because the check has now followed the
      // implementation twice: the weight lived in gradient stops, then on the
      // element when the bands went flat, and now in the stops again because
      // the bands ramp in hue AND weight together (`bandPlotGradient`).
      //
      // THE PROPERTY BEING PROTECTED IS UNCHANGED. Recharts' ReferenceArea
      // defaults fillOpacity to 0.5, so a band whose weight is not stated is
      // drawn at half whatever the tokens decided. When that happened every
      // band landed in the same beige and the whole chart read as grey — while
      // the key, the boundary lines and the tokens themselves were all
      // perfectly correct. Nothing short of reading the painted opacity sees
      // it. So: the element must be at exactly 1 (stated, not defaulted), and
      // every stop-opacity inside must be one the tokens actually produce.
      // ─────────────────────────────────────────────────────────────────
      // The same selector e2e/chart-bands.spec.ts measures band geometry
      // through, so the two specs cannot disagree about what a band is.
      await page.waitForTimeout(900);
      const bandPaint = await page.evaluate(() => {
        const rects = [...document.querySelectorAll('.recharts-reference-area-rect')];
        return rects
          // The status bands are the tall ones. Anything short is a boundary
          // artefact rather than a band.
          .filter((r) => Number(r.getAttribute('height')) > 8)
          .map((r) => {
            const el = r as SVGElement;
            const fill = getComputedStyle(el).fill;
            const id = /url\(["']?#([^"')]+)/.exec(fill)?.[1] ?? null;
            const gradient = id ? document.getElementById(id) : null;
            return {
              fillOpacity: Number(getComputedStyle(el).fillOpacity),
              gradientId: id,
              stops: gradient
                ? [...gradient.querySelectorAll('stop')].map((s) => Number(getComputedStyle(s).stopOpacity))
                : [],
            };
          });
      });
      expect(bandPaint.length, `${theme}: no status bands were painted at all`).toBeGreaterThanOrEqual(5);

      for (const band of bandPaint) {
        // The element carries no weight of its own. 0.5 here is the library's
        // default showing through, which is the failure this test exists for.
        expect(
          band.fillOpacity,
          `${theme}: a band's own fill-opacity is ${band.fillOpacity}; the weight belongs in the stops and this must be exactly 1`,
        ).toBeCloseTo(1, 5);
        expect(band.gradientId, `${theme}: a band is not painted with a gradient at all`).not.toBeNull();
        expect(band.stops.length, `${theme}: gradient ${band.gradientId} has no stops`).toBeGreaterThanOrEqual(2);
      }

      // EVERY STOP IS A WEIGHT THE TOKENS PRODUCE. The three peaks and the two
      // handover fractions between them, computed here from the same numbers
      // rather than transcribed — a stop at 0.5 could not survive this, and
      // neither could a band drawn at a weight nobody chose.
      const PEAK = { inRange: 0.11, out: 0.21, significant: 0.28 };
      const ALLOWED = [
        PEAK.inRange,
        PEAK.inRange * 0.86, // the green easing off at its own edges
        PEAK.out,
        PEAK.out * 0.62, // an out-of-range band where it meets the reference bound
        PEAK.out * 0.82,
        PEAK.significant,
        PEAK.out, // and where significantly-out begins, which is the same weight
      ];
      for (const band of bandPaint) {
        for (const stop of band.stops) {
          expect(
            ALLOWED.some((w) => Math.abs(w - stop) < 0.002),
            `${theme}: a band stop is painted at ${stop}, which is not a weight these tokens produce ` +
              `(${ALLOWED.map((w) => w.toFixed(3)).join(', ')}).`,
          ).toBe(true);
        }
      }

      // THE LADDER IS ON SCREEN, not merely in the token file: the heaviest
      // stop anywhere is the significantly-out peak and the lightest is inside
      // the in-range band, so a chart that painted every band at one value
      // could not pass by accident.
      const allStops = bandPaint.flatMap((b) => b.stops);
      expect(Math.max(...allStops)).toBeCloseTo(PEAK.significant, 2);
      expect(Math.min(...allStops)).toBeLessThan(PEAK.out * 0.62 + 0.001);
      expect(new Set(allStops.map((o) => o.toFixed(3))).size, `${theme}: every band stop is the same weight`).toBeGreaterThanOrEqual(3);

      // ONE GRADIENT PER DRAWN BAND, not one per status: the stops are placed
      // by value and mapped onto each rect's own clamped extent, so two bands
      // sharing a definition would mean one of them had the wrong geometry.
      expect(new Set(bandPaint.map((b) => b.gradientId)).size).toBe(bandPaint.length);

      // The band tokens themselves still carry real colour in this theme. A
      // band drawn at its own weight is worth nothing if the value behind it
      // has been flattened to the surface colour. `plot` is what the chart
      // composites now; `band` is the pre-mixed role the range bar still
      // paints, and both have to hold.
      const hues = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return ['green', 'yellow', 'orange', 'red'].flatMap((h) =>
          ['band', 'plot'].map((role) => ({
            hue: `${h}-${role}`,
            channels: styles.getPropertyValue(`--c-hue-${h}-${role}`).trim(),
          })),
        );
      });
      for (const { hue, channels } of hues) {
        const [r, g, b] = channels.split(/\s+/).map(Number);
        expect(Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b), `${theme}: --c-hue-${hue} is "${channels}"`).toBe(true);
        expect(
          Math.max(r, g, b) - Math.min(r, g, b),
          `${theme}: the ${hue} token has no colour in it (${channels})`,
        ).toBeGreaterThanOrEqual(8);
      }

      // Copy and rendering agree. The chart says in words when its points are
      // NOT joined — in the key, beside the marks it is about — and a page
      // carrying that entry while a trend line is drawn is the chart lying
      // about its own data. (The old positive form of this sentence, a
      // paragraph above every healthy chart explaining the absence of a
      // problem, is gone; only the two cases worth stating are stated.)
      const text = await page.locator('body').innerText();
      const saysUnjoined = text.includes("aren’t comparable for this marker");
      const saysFirst = text.includes('first result for this marker');
      const saysJoined = !saysUnjoined && !saysFirst;
      const line = await page.evaluate(() => {
        const curve = document.querySelector('path.recharts-line-curve') as SVGPathElement | null;
        if (!curve) return { drawn: false, length: 0 };
        const stroke = getComputedStyle(curve).stroke;
        return { drawn: stroke !== 'none' && stroke !== '' && curve.getTotalLength() > 1, length: curve.getTotalLength() };
      });
      expect(line.drawn, `${theme}: copy says the results are joined into a line, and none is drawn`).toBe(saysJoined);

      // ─────────────────────────────────────────────────────────────────
      // THE NON-COLOUR CARRIER, WHICH MOVED (Aug 2026).
      //
      // The key used to name every BAND in words and this asserted it. The
      // band entries are gone: every reference bound is now printed on the
      // left axis in figures, level with its own hairline, which is a more
      // specific answer to "where does my range start" than a sentence beside
      // a coloured swatch and one a greyscale reader gets in full.
      //
      // So the claim being protected is the same and the evidence for it is
      // different: the bounds are on the axis as NUMBERS, and every point
      // state is still named in WORDS in the key. What must never happen is a
      // band with neither.
      // ─────────────────────────────────────────────────────────────────
      const axisBounds = await page.evaluate(() => {
        const svg = document.querySelector('.recharts-surface');
        if (!svg) return [];
        return ([...svg.querySelectorAll('text')] as SVGTextElement[])
          .filter((t) => !t.closest('.recharts-cartesian-axis'))
          .filter((t) => (t.getAttribute('font-family') ?? '').includes('mono'))
          .map((t) => t.textContent ?? '');
      });
      const numericBounds = axisBounds.filter((t) => t.trim() !== '' && Number.isFinite(Number(t)));
      expect(
        numericBounds.length,
        `${theme}: the reference bounds are not printed anywhere on the axis (${JSON.stringify(axisBounds)})`,
      ).toBeGreaterThanOrEqual(2);
      // And none of them is a raw float. A converted range arrives with no
      // rounding of its own and once printed 5.494444506110488 beside the plot.
      for (const label of numericBounds) {
        expect(label.length, `${theme}: "${label}" is a raw float, not a reference bound`).toBeLessThanOrEqual(7);
      }

      // And the point states, in words, in the key. At least one, because a
      // series that is entirely in range has exactly one state to name.
      const keyWords = await page
        .getByText(/^(In range|Above range|Below range|Significantly above range|Significantly below range)$/)
        .count();
      expect(keyWords, `${theme}: no point state is named in words`).toBeGreaterThan(0);

      // Nothing evaluative anywhere on the page.
      const body = (await page.locator('body').innerText()).toLowerCase();
      for (const word of ['danger', 'concerning', 'unhealthy', 'bad result']) {
        expect(body.includes(word), `the marker page says "${word}"`).toBe(false);
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
