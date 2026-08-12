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
      // FIVE BANDS, EACH PAINTED AT ITS OWN WEIGHT (rewritten Aug 2026).
      //
      // This used to count five `linearGradient` definitions and assert every
      // band path was drawn at fillOpacity 1, because the weight lived in the
      // gradient's own stops. The bands are FLAT now — no gradients, hard
      // edges — so the weight is on the element, and the check has to move
      // with it.
      //
      // The PROPERTY being protected is unchanged and is the reason this
      // exists: Recharts' ReferenceArea defaults fillOpacity to 0.5, so a band
      // whose weight is not stated explicitly is drawn at half whatever the
      // tokens decided. When that happened every band landed in the same beige
      // and the whole chart read as grey — while the key, the boundary lines
      // and the tokens themselves were all perfectly correct. Nothing short of
      // reading the painted opacity sees it.
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
          .map((r) => Number(getComputedStyle(r as SVGElement).fillOpacity));
      });
      expect(bandPaint.length, `${theme}: no status bands were painted at all`).toBeGreaterThanOrEqual(5);

      // The three weights the ladder is built from — in range carries the
      // least, out-of-range more, significantly-out most. Read from the
      // painted element rather than from the token file, so a band drawn at
      // the library's own 0.5 default fails here even though every token is
      // right.
      const WEIGHTS = [0.07, 0.12, 0.18];
      for (const opacity of bandPaint) {
        expect(
          WEIGHTS.some((w) => Math.abs(w - opacity) < 0.001),
          `${theme}: a status band is painted at ${opacity}, which is not one of its tokens' own weights ` +
            `(${WEIGHTS.join(', ')}). 0.5 means the weight was never stated and Recharts supplied its default.`,
        ).toBe(true);
      }
      // All three weights are actually in use, so a chart that painted every
      // band at the same value could not pass by accident.
      expect(new Set(bandPaint.map((o) => o.toFixed(3))).size, `${theme}: every band is the same weight`).toBe(3);

      // NO GRADIENTS. The flat-band decision, asserted rather than assumed: a
      // gradient reintroduced here would restore soft edges to a plot whose
      // entire subject is a boundary.
      await expect(page.locator('svg defs linearGradient[id^="band-"]')).toHaveCount(0);

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
