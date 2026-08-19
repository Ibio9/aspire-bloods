import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * THE COMPARE CHART IS THE SINGLE-MARKER TREND CHART (Aug 2026).
 *
 * It was the last thing in the product drawing a banded background: a
 * green-to-red field behind the lines, so the loudest thing on the plot was the
 * context rather than the reader's own results. What this measures is that the
 * rebuild actually landed on the rendered page, which reading the source cannot
 * tell you - a gradient that fails to resolve paints nothing at all, and a
 * `<ReferenceArea>` left behind is invisible in a diff and obvious on screen.
 *
 * Five things, in both themes:
 *
 *   1. ZERO filled regions. No `<ReferenceArea>` rect of any kind.
 *   2. ONE STATUS GRADIENT PER SERIES, in the status colours, plus its casing.
 *   3. Straight segments: every line is `type="linear"`, which shows up as a
 *      path made of `L` commands with no `C` in it.
 *   4. Every point is a white spark, referencing one radial gradient, in the
 *      SHAPE its own series' legend chip uses (Aug 2026, second pass) - the
 *      colour is still uniform across every series, only the outline varies.
 *   5. The boundary rules are labelled in the gutter at two weights.
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

test.describe('Compare chart', () => {
  test('draws lines, rules, sparks and no bands, in both themes', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 950 });

    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/results?view=compare');
      await page.evaluate((t) => {
        localStorage.setItem('aspire_theme', t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      }, theme);

      // Two markers with several results each, chosen through the picker the
      // way a reader does rather than by typing ids into the URL.
      await page.getByRole('button', { name: 'Iron status' }).click();
      const plot = page.getByRole('img', { name: /Comparison chart/ });
      await expect(plot).toBeVisible({ timeout: 15_000 });
      await expect(plot.locator('svg .recharts-line-curve').first()).toBeVisible({ timeout: 15_000 });

      const drawn = await plot.evaluate((el) => {
        const svg = el.querySelector('svg') as SVGSVGElement;
        const curves = [...svg.querySelectorAll('.recharts-line-curve')] as SVGPathElement[];
        const stopsOf = (g: Element) =>
          [...g.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color') ?? '');
        return {
          areas: svg.querySelectorAll('.recharts-reference-area-rect').length,
          lineGradients: [...svg.querySelectorAll('linearGradient[id^="status-line-"]')].map(stopsOf),
          glowGradients: svg.querySelectorAll('linearGradient[id^="status-glow-"]').length,
          sparkGradients: [...svg.querySelectorAll('radialGradient[id^="spark-"]')].map((g) => g.id),
          sparkCircles: [...svg.querySelectorAll('circle')].filter((c) =>
            (c.getAttribute('fill') ?? '').startsWith('url(#spark-'),
          ).length,
          // The white bead sits on top of each halo and takes the token colour
          // rather than a status one - whatever shape it is drawn as, circle or
          // rect (a square, or a diamond via a rotated rect).
          beadFills: [
            ...new Set(
              [...svg.querySelectorAll('circle'), ...svg.querySelectorAll('rect')]
                .map((c) => c.getAttribute('fill') ?? '')
                .filter((f) => f.startsWith('rgb(') || f.startsWith('#')),
            ),
          ],
          // The bead's own outline, per series - a circle for the first series,
          // a plain rect for the second (square), a rotated rect for the third
          // (diamond). Two series on this chart, so circle and square both
          // appear.
          beadCircleCount: [...svg.querySelectorAll('circle')].filter(
            (c) => c.getAttribute('fill') === 'rgb(var(--c-chart-spark-core))',
          ).length,
          beadRectCount: [...svg.querySelectorAll('rect')].filter(
            (c) => c.getAttribute('fill') === 'rgb(var(--c-chart-spark-core))',
          ).length,
          curvePaths: curves.map((c) => c.getAttribute('d') ?? ''),
          curveStrokes: curves.map((c) => c.getAttribute('stroke') ?? ''),
          boundLabels: [...svg.querySelectorAll('g[data-boundary-label]')].map((g) => ({
            kind: g.getAttribute('data-boundary-label') ?? '',
            text: g.querySelector('text')?.textContent ?? '',
          })),
        };
      });

      // 1. NO FILLED REGIONS.
      expect(drawn.areas, `${theme}: the compare plot draws ${drawn.areas} filled regions`).toBe(0);

      // 2. A STATUS GRADIENT PER SERIES, and a casing gradient for each.
      expect(
        drawn.lineGradients.length,
        `${theme}: ${drawn.lineGradients.length} line gradients for 2 series`,
      ).toBe(2);
      expect(drawn.glowGradients, `${theme}: ${drawn.glowGradients} casing gradients`).toBe(2);
      for (const stops of drawn.lineGradients) {
        expect(stops.length, `${theme}: a line gradient carries ${stops.length} stops`).toBeGreaterThanOrEqual(2);
        for (const colour of stops) {
          expect(colour, `${theme}: a line gradient stop is "${colour}"`).toMatch(/^rgb\(/);
        }
      }

      // 3. STRAIGHT SEGMENTS, NEVER CURVES.
      for (const d of drawn.curvePaths) {
        expect(d, `${theme}: a line is drawn with a cubic segment`).not.toMatch(/[CcSsQqTt]/);
      }
      // Every drawn line takes a gradient, never a flat colour.
      for (const stroke of drawn.curveStrokes) {
        expect(stroke, `${theme}: a line is stroked "${stroke}"`).toMatch(/^url\(#status-(line|glow)-/);
      }

      // 4. ONE SPARK, SHARED BY EVERY POINT ON EVERY SERIES.
      expect(
        new Set(drawn.sparkGradients).size,
        `${theme}: the plot holds ${drawn.sparkGradients.length} spark gradients`,
      ).toBe(1);
      expect(drawn.sparkCircles, `${theme}: ${drawn.sparkCircles} lit points`).toBeGreaterThan(1);
      expect(drawn.beadFills, `${theme}: the beads are ${drawn.beadFills.join(', ')}`).toEqual([
        'rgb(var(--c-chart-spark-core))',
      ]);
      // Two series (Ferritin, Haemoglobin under "Iron status"), so the first
      // series' circle beads and the second series' square beads should both
      // be on the plot - the shape carries which line a point belongs to.
      expect(drawn.beadCircleCount, `${theme}: ${drawn.beadCircleCount} circle beads`).toBeGreaterThan(0);
      expect(drawn.beadRectCount, `${theme}: ${drawn.beadRectCount} square/diamond beads`).toBeGreaterThan(0);

      // 5. THE RULES ARE LABELLED, at two weights.
      const kinds = drawn.boundLabels.map((b) => b.kind);
      expect(kinds, `${theme}: the gutter labels are ${JSON.stringify(drawn.boundLabels)}`).toContain('bound');
      expect(drawn.boundLabels.map((b) => b.text)).toEqual(
        expect.arrayContaining(['Range low', 'Range high']),
      );

      // The CARD rather than the viewport: the key under the plot is the half
      // that says what the drawing means, and it is below the fold at 950px.
      // `../..` is the plot's own wrapper and then the card: the key under the
      // plot is the half that says what the drawing means, and it is below the
      // fold at 950px.
      await plot.locator('xpath=../..').screenshot({ path: `screenshots/compare-chart-${theme}.png` });
    }

    await ctx.close();
  });
});
