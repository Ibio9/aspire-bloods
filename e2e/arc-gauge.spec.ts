import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * ===========================================================================
 *  THE ARC GAUGE, MEASURED OFF THE RENDERED PAGE.
 * ===========================================================================
 *
 * This replaces the geometry the range bar's own specs used to assert. It is
 * NOT a rename: a bar's claims were about `left:` percentages along a track,
 * and an arc's are about angles round a circle, so every one of them had to be
 * re-derived. What did not change is WHICH claims are worth making, and they
 * are the three the whole scale module exists for:
 *
 *  1. THE PRINTED FIGURES ARE THE SCALE THAT WAS DRAWN. Not the reference
 *     bounds — that is the bug this instrument was rebuilt around. A result
 *     three times its upper limit is drawn three times out, on a longer scale,
 *     with the figures in the gap saying so.
 *  2. THE MARK IS NEVER CLAMPED. There is no end to pin it to.
 *  3. THE BOUNDARY IS MARKED WITH SOMETHING THAT IS NOT A COLOUR. Two radial
 *     hairlines, so the reference range is locatable in greyscale and on paper.
 *
 * Plus the two that are new because the shape is:
 *
 *  4. IT IS AN ARC AND NOT A RING — 270° of paint and a 90° gap at the bottom.
 *     A full circle says the scale wraps, and a value between two bounds does
 *     not wrap.
 *  5. IT IS SQUARE AND FLUID at every viewport, and it never paints outside
 *     its own box.
 *
 * ── WHY THE MEASUREMENTS COME OFF THE PAINT ────────────────────────────────
 *
 * The mark's angle is read from its computed `transform` matrix rather than
 * from the inline style, and the ring's stops from `background-image` as the
 * browser resolved it. A component test can only say what the component
 * intended; this says what Chromium drew.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** The arc's own geometry, restated so a change to it fails here rather than on screen. */
const ARC_START_DEG = 135;
const ARC_SWEEP_DEG = 270;

const SIZES = [
  { width: 1440, height: 900, at: 'desktop' },
  { width: 390, height: 844, at: 'mobile' },
] as const;

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

async function context(browser: Browser, theme: 'light' | 'dark', size: (typeof SIZES)[number]) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a private window with no storage is not a reason to fail */
    }
  }, theme);
  await signIn(ctx.request);
  return ctx;
}

/** A marker with a numeric result and a two-sided range, so a gauge is actually drawn. */
async function aMarkerWithAGauge(page: Page, request: APIRequestContext): Promise<string> {
  const markers = (await (await request.get('/api/patient/markers')).json()) as {
    markerId: string;
    resultType?: string;
    resultCount: number;
  }[];
  const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 1);
  expect(measured.length, 'no measured marker in the seed — run the demo seed').toBeGreaterThan(0);
  for (const m of measured) {
    await page.goto(`/markers/${m.markerId}`);
    await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
    // The mark sweeps on mount; measuring mid-sweep is measuring nothing.
    await page.waitForTimeout(900);
    if (await page.locator('.arc-gauge').count()) return m.markerId;
  }
  throw new Error('no marker page drew an arc gauge');
}

/**
 * Everything about the gauge that can only be read off the rendered element.
 *
 * The mark's ANGLE comes out of the computed transform matrix — `atan2(b, a)`
 * of `matrix(a, b, c, d, e, f)` is the rotation the browser applied — which is
 * the one form of it that survives a transform somebody adds to an ancestor.
 */
async function readGauge(page: Page) {
  return page.evaluate(
    ({ start, sweep }) => {
      const root = document.querySelector('.arc-gauge') as HTMLElement | null;
      if (!root) return null;
      const box = root.getBoundingClientRect();
      const ring = root.querySelector('.arc-gauge__ring') as HTMLElement;
      const ringStyle = getComputedStyle(ring);

      // The rotated wrapper is the only element in here carrying a rotation.
      const rotated = [...root.querySelectorAll<HTMLElement>('div')].find((d) => {
        const t = getComputedStyle(d).transform;
        return t && t !== 'none' && t.startsWith('matrix');
      });
      let markPct: number | null = null;
      let markBox: DOMRect | null = null;
      if (rotated) {
        const m = getComputedStyle(rotated).transform.match(/matrix\(([^)]+)\)/);
        if (m) {
          const [a, b] = m[1].split(',').map(Number);
          // The wrapper is rotated by (screenAngle + 90): the mark rides at its
          // twelve o'clock, which is −90° in screen degrees.
          let deg = (Math.atan2(b, a) * 180) / Math.PI - 90;
          while (deg < start) deg += 360;
          markPct = ((deg - start) / sweep) * 100;
        }
        const dot = rotated.firstElementChild as HTMLElement | null;
        if (dot) markBox = dot.getBoundingClientRect();
      }

      const ticks = [...root.querySelectorAll('line')].length;
      const figures = [...root.querySelectorAll(':scope > span.numeric')].map((s) => ({
        text: (s.textContent ?? '').trim(),
        muted: getComputedStyle(s as HTMLElement).color,
        box: (() => {
          const r = (s as HTMLElement).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        })(),
      }));

      return {
        box: { width: box.width, height: box.height, top: box.top, left: box.left, right: box.right, bottom: box.bottom },
        gradient: ringStyle.backgroundImage,
        markPct,
        markBox: markBox ? { top: markBox.top, left: markBox.left, right: markBox.right, bottom: markBox.bottom } : null,
        ticks,
        figures,
        label: root.getAttribute('aria-label'),
      };
    },
    { start: ARC_START_DEG, sweep: ARC_SWEEP_DEG },
  );
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`the arc gauge is an arc, to scale, at ${size.at} in ${theme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const ctx = await context(browser, theme, size);
      const page = await ctx.newPage();
      await aMarkerWithAGauge(page, ctx.request);

      const g = await readGauge(page);
      expect(g, 'no arc gauge rendered on the marker page').not.toBeNull();

      // eslint-disable-next-line no-console
      console.log(
        `\n  ${theme} ${size.at}: ${Math.round(g!.box.width)}x${Math.round(g!.box.height)}, ` +
          `mark at ${g!.markPct?.toFixed(1)}%, ${g!.ticks} ticks, figures [${g!.figures.map((f) => f.text).join(', ')}]`,
      );

      // 5. SQUARE AND FLUID. A gauge that is not square is a gauge whose arc is
      //    an ellipse, and an ellipse has no constant radius for a mark to ride.
      expect(Math.abs(g!.box.width - g!.box.height), 'the gauge is not square').toBeLessThan(2);
      expect(g!.box.width, 'the gauge collapsed').toBeGreaterThan(80);

      // 4. AN ARC, NOT A RING. Three quarters of a turn painted, a quarter empty,
      //    and it starts at the lower left so low is the first thing on it.
      expect(g!.gradient, 'the ring is not a conic gradient').toContain('conic-gradient');
      expect(g!.gradient).toContain('from 225deg');
      const stops = [...g!.gradient.matchAll(/\s([\d.]+)%/g)].map((m) => Number(m[1]));
      expect(Math.max(...stops.filter((s) => s < 100)), 'the arc paints past its own gap').toBeLessThanOrEqual(75.001);
      expect(g!.gradient, 'the gap is not a hard stop, so the arc fades into it').toMatch(
        /75(\.\d+)?%,\s*(rgba\(0,\s*0,\s*0,\s*0\)|transparent)\s*75(\.\d+)?%/,
      );

      // 3. THE BOUNDARY IS MARKED WITHOUT COLOUR. Two reference bounds, two
      //    radial hairlines. The optimal narrowing adds more, so this is a floor.
      expect(g!.ticks, 'the reference bounds are not marked').toBeGreaterThanOrEqual(2);

      // 1 & 2. THE FIGURES ARE THE SCALE, AND THE MARK IS ON IT. The accessible
      //    label carries the value and the range in words; the printed figures
      //    have to CONTAIN that range rather than being it.
      const label = g!.label ?? '';
      const range = label.match(/reference range ([\d.]+)[–-]([\d.]+)/);
      const value = label.match(/Result ([\d.]+)/);
      expect(range, `the gauge did not state its range in words: ${label}`).not.toBeNull();
      expect(value, `the gauge did not state its value in words: ${label}`).not.toBeNull();

      const figures = g!.figures.map((f) => Number(f.text)).filter((n) => Number.isFinite(n));
      expect(figures.length, 'the gauge printed no figures at all').toBeGreaterThanOrEqual(2);
      const lo = Number(range![1]);
      const hi = Number(range![2]);
      const v = Number(value![1]);
      expect(Math.min(...figures), 'the printed scale does not reach below the reference range').toBeLessThanOrEqual(lo);
      expect(Math.max(...figures), 'the printed scale does not reach above the reference range').toBeGreaterThanOrEqual(hi);
      expect(Math.min(...figures), 'the printed scale does not contain the value').toBeLessThanOrEqual(v);
      expect(Math.max(...figures), 'the printed scale does not contain the value').toBeGreaterThanOrEqual(v);

      // AND THE MARK SITS AT THE VALUE'S POSITION ON THE SCALE IT PRINTED.
      // Read off the paint, so this is the browser's answer and not the
      // component's. Slack of one percent for sub-pixel rounding in the matrix.
      const ends = [Math.min(...figures), Math.max(...figures)];
      const expected = ((v - ends[0]) / (ends[1] - ends[0])) * 100;
      expect(g!.markPct, 'the mark is not on the scale the gauge printed').not.toBeNull();
      expect(Math.abs(g!.markPct! - expected), `mark at ${g!.markPct?.toFixed(2)}% against ${expected.toFixed(2)}%`).toBeLessThan(1.5);
      // NOT CLAMPED. The scale is built to contain the value with headroom, so a
      // mark pinned to either end is a scale that stopped containing its own value.
      expect(g!.markPct!).toBeGreaterThan(0.5);
      expect(g!.markPct!).toBeLessThan(99.5);

      // AND IT NEVER PAINTS OUTSIDE ITS OWN BOX. The mark overhangs the ring by
      // half its width, which is exactly what the gutter round the ring is for.
      expect(g!.markBox, 'the mark did not render').not.toBeNull();
      expect(g!.markBox!.left).toBeGreaterThanOrEqual(g!.box.left - 1);
      expect(g!.markBox!.right).toBeLessThanOrEqual(g!.box.right + 1);
      expect(g!.markBox!.top).toBeGreaterThanOrEqual(g!.box.top - 1);
      expect(g!.markBox!.bottom).toBeLessThanOrEqual(g!.box.bottom + 1);

      // THE FIGURES SIT IN THE GAP, which is the argument for the gap being at
      // the bottom: the place the scale stops is the place its ends are printed.
      // The two scale ends are the lowest things in the box.
      const lowest = Math.max(...g!.figures.map((f) => f.box.bottom));
      expect(lowest, 'no figure is drawn in the arc’s own gap').toBeGreaterThan(g!.box.top + g!.box.height * 0.7);

      await ctx.close();
    });
  }
}

/**
 * ── THE CARD GAUGE DROPS THE BOUND LABELS AND KEEPS THE TICKS ──────────────
 *
 * The one judgement call in the redraw, and it is the same call the card BAR
 * made: at the width a marker card gives it, four figures round an arc collide,
 * and of the two pairs the SCALE ENDS are the ones that cannot be recovered
 * from anything else on the card — the card states its reference range in words
 * two lines below, and nothing else states the scale.
 *
 * So the bounds keep their hairlines (the boundary is still marked, still at the
 * middle of its own blend, still locatable in greyscale) and lose their numbers.
 * Asserted rather than left to a comment, because "we dropped this deliberately"
 * and "this went missing" look identical on a screenshot.
 */
for (const size of SIZES) {
  test(`a result card's gauge keeps its ticks and drops its bound labels at ${size.at}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await context(browser, 'dark', size);
    const page = await ctx.newPage();
    await page.goto('/results');
    await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);

    const cards = await page.evaluate(() => {
      const out: { figures: string[]; ticks: number; width: number }[] = [];
      for (const g of document.querySelectorAll<HTMLElement>('.arc-gauge')) {
        out.push({
          figures: [...g.querySelectorAll(':scope > span.numeric')].map((s) => (s.textContent ?? '').trim()),
          ticks: g.querySelectorAll('line').length,
          width: Math.round(g.getBoundingClientRect().width),
        });
      }
      return out;
    });

    expect(cards.length, 'the marker list drew no gauges').toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`\n  ${size.at}: ${cards.length} card gauges, first is ${cards[0].width}px with ${cards[0].figures.length} figures`);

    for (const c of cards.slice(0, 12)) {
      expect(c.figures.length, `a card gauge printed ${c.figures.length} figures rather than its two scale ends`).toBe(2);
      expect(c.ticks, 'a card gauge lost its reference-bound hairlines').toBeGreaterThanOrEqual(2);
    }

    await ctx.close();
  });
}
