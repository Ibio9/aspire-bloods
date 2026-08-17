import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * ===========================================================================
 *  THE ARC GAUGE, MEASURED OFF THE RENDERED PAGE.
 * ===========================================================================
 *
 * The instrument has been rebuilt twice and this file has been rewritten with
 * it both times, because each rebuild changed WHICH CLAIM is worth measuring —
 * not merely how to reach it. Worth stating in order, because the current
 * assertions only make sense against what they replaced:
 *
 *   THE BAR   drew a numeric scale and printed its ends, and the claims were
 *             "the printed ends ARE the scale" and "the mark is at the value's
 *             position on them".
 *   THE ARC   bent that round. Same claims, read in angles instead of
 *             percentages — and it introduced a failure a straight bar cannot
 *             have: THE GREEN MOVED. An above-range value pushed the in-range
 *             region toward the start of the ring and a below-range value
 *             pushed it toward the end, so two cards side by side on one grid
 *             showed the reference zone in two different places. On a ring the
 *             SHAPE is what a reader takes in before any number, and it meant
 *             something different on every card.
 *   NOW       the ring is FIXED and symmetric. Green central, gold flanking,
 *             red at both ends, the four boundaries at four constant angles.
 *             So the claims are:
 *
 *               1. THE RING IS THE SAME PICTURE ON EVERY GAUGE ON THE PAGE.
 *                  Asserted across every gauge a real report renders, as an
 *                  identity rather than a resemblance.
 *               2. THE MARK IS IN THE SLICE ITS OWN STATUS NAMES, so the colour
 *                  under it always agrees with the word beside it.
 *               3. IT IS NEVER AT EITHER END. The two outer bands are unbounded
 *                  in value and finite in angle; a mark pinned to the end has
 *                  stopped carrying information.
 *               4. THE FOUR BOUNDARIES ARE MARKED without colour, at the four
 *                  fixed angles.
 *               5. IT IS SQUARE AND FLUID and never paints outside its own box.
 *
 * ── WHY THE MEASUREMENTS COME OFF THE PAINT ────────────────────────────────
 *
 * The mark's angle is read from its computed `transform` MATRIX rather than
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

/**
 * The four fixed boundaries, as fractions along the arc — the same derivation
 * `lib/rangeScale.ts` exports, restated rather than imported so that a change
 * there has to be made deliberately in two places. A spec that imports the
 * number it is checking is checking that a constant equals itself.
 */
const GREEN_SHARE = 0.32;
const GOLD_SHARE = 0.19;
const RED_SHARE = (1 - GREEN_SHARE - 2 * GOLD_SHARE) / 2;
const BOUNDARY = {
  lowThreshold: RED_SHARE,
  low: RED_SHARE + GOLD_SHARE,
  high: RED_SHARE + GOLD_SHARE + GREEN_SHARE,
  highThreshold: 1 - RED_SHARE,
};

/** Which slice each status word owns, keyed by the phrase the gauge puts in its own label. */
const SLICE: Record<string, [number, number]> = {
  'significantly below range': [0, BOUNDARY.lowThreshold],
  'below range': [BOUNDARY.lowThreshold, BOUNDARY.low],
  'in range': [BOUNDARY.low, BOUNDARY.high],
  'above range': [BOUNDARY.high, BOUNDARY.highThreshold],
  'significantly above range': [BOUNDARY.highThreshold, 1],
};

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
 * Everything about every gauge on the page that can only be read off the render.
 *
 * The mark's ANGLE comes out of the computed transform matrix — `atan2(b, a)` of
 * `matrix(a, b, c, d, e, f)` is the rotation the browser applied — which is the
 * one form of it that survives a transform somebody later adds to an ancestor.
 */
async function readGauges(page: Page) {
  return page.evaluate(
    ({ start, sweep }) => {
      return [...document.querySelectorAll<HTMLElement>('.arc-gauge')].map((root) => {
        const box = root.getBoundingClientRect();
        const ring = root.querySelector('.arc-gauge__ring') as HTMLElement;

        const rotated = [...root.querySelectorAll<HTMLElement>('div')].find((d) => {
          const t = getComputedStyle(d).transform;
          return t && t !== 'none' && t.startsWith('matrix');
        });
        let markAt: number | null = null;
        let markBox: { top: number; left: number; right: number; bottom: number } | null = null;
        if (rotated) {
          const m = getComputedStyle(rotated).transform.match(/matrix\(([^)]+)\)/);
          if (m) {
            const [a, b] = m[1].split(',').map(Number);
            // The wrapper is rotated by (screenAngle + 90): the mark rides at
            // its twelve o'clock, which is −90° in screen degrees.
            let deg = (Math.atan2(b, a) * 180) / Math.PI - 90;
            while (deg < start) deg += 360;
            markAt = (deg - start) / sweep;
          }
          const dot = rotated.firstElementChild as HTMLElement | null;
          if (dot) {
            const r = dot.getBoundingClientRect();
            markBox = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
          }
        }

        // Every hairline, as a fraction along the arc, recovered from its outer
        // endpoint against the centre of the 0–100 user space.
        const hairlines = [...root.querySelectorAll('line')]
          .map((l) => {
            const x = Number(l.getAttribute('x2')) - 50;
            const y = Number(l.getAttribute('y2')) - 50;
            let deg = (Math.atan2(y, x) * 180) / Math.PI;
            if (deg < start) deg += 360;
            return (deg - start) / sweep;
          })
          .sort((a, b) => a - b);

        return {
          box: { width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom },
          gradient: getComputedStyle(ring).backgroundImage,
          markAt,
          markBox,
          hairlines,
          figures: [...root.querySelectorAll(':scope > span.numeric')].map((s) => (s.textContent ?? '').trim()),
          label: root.getAttribute('aria-label') ?? '',
        };
      });
    },
    { start: ARC_START_DEG, sweep: ARC_SWEEP_DEG },
  );
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`the arc gauge is a fixed, symmetric arc at ${size.at} in ${theme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const ctx = await context(browser, theme, size);
      const page = await ctx.newPage();
      await aMarkerWithAGauge(page, ctx.request);

      const [g] = await readGauges(page);
      expect(g, 'no arc gauge rendered on the marker page').toBeTruthy();

       
      console.log(
        `\n  ${theme} ${size.at}: ${Math.round(g.box.width)}x${Math.round(g.box.height)}, ` +
          `mark at ${((g.markAt ?? 0) * 100).toFixed(1)}%, ${g.hairlines.length} hairlines, figures [${g.figures.join(', ')}]`,
      );

      // 5. SQUARE AND FLUID. A gauge that is not square is a gauge whose arc is
      //    an ellipse, and an ellipse has no constant radius for a mark to ride.
      expect(Math.abs(g.box.width - g.box.height), 'the gauge is not square').toBeLessThan(2);
      expect(g.box.width, 'the gauge collapsed').toBeGreaterThan(80);

      // AN ARC, NOT A RING. Three quarters of a turn painted, a quarter empty,
      // starting at the lower left so low is the first thing on it.
      expect(g.gradient, 'the ring is not a conic gradient').toContain('conic-gradient');
      expect(g.gradient).toContain('from 225deg');
      const stops = [...g.gradient.matchAll(/\s([\d.]+)%/g)].map((m) => Number(m[1]));
      expect(Math.max(...stops.filter((s) => s < 100)), 'the arc paints past its own gap').toBeLessThanOrEqual(75.001);
      expect(g.gradient, 'the gap is not a hard stop, so the arc fades into it').toMatch(
        /75(\.\d+)?%,\s*(rgba\(0,\s*0,\s*0,\s*0\)|transparent)\s*75(\.\d+)?%/,
      );

      // 4. THE FOUR BOUNDARIES, MARKED WITHOUT COLOUR, AT FOUR FIXED ANGLES.
      //    The optimal narrowing can add more, so the four are checked as a
      //    subset rather than as the whole list.
      for (const [name, at] of Object.entries(BOUNDARY)) {
        expect(
          g.hairlines.some((h) => Math.abs(h - at) < 0.005),
          `no hairline at the ${name} boundary (${(at * 100).toFixed(1)}%); found ${g.hairlines
            .map((h) => (h * 100).toFixed(1))
            .join(', ')}`,
        ).toBe(true);
      }

      // 2. THE MARK IS IN THE SLICE ITS OWN STATUS NAMES. The gauge states its
      //    status in words in its own accessible label, so this compares the
      //    thing a screen reader is told with the thing an eye is shown.
      const status = (g.label.match(/status:\s*(.+)$/i)?.[1] ?? '').trim().toLowerCase();
      const slice = SLICE[status];
      expect(slice, `the gauge reported an unrecognised status: "${status}"`).toBeTruthy();
      expect(g.markAt, 'the mark did not render').not.toBeNull();
      expect(
        g.markAt!,
        `"${status}" drawn at ${(g.markAt! * 100).toFixed(1)}%, outside its slice ${(slice[0] * 100).toFixed(0)}–${(
          slice[1] * 100
        ).toFixed(0)}%`,
      ).toBeGreaterThanOrEqual(slice[0] - 0.005);
      expect(g.markAt!).toBeLessThanOrEqual(slice[1] + 0.005);

      // 3. AND NEVER AT EITHER END.
      expect(g.markAt!, 'the mark reached the start of the arc').toBeGreaterThan(0);
      expect(g.markAt!, 'the mark reached the end of the arc').toBeLessThan(1);

      // TWO FIGURES, AND THEY ARE THE TWO REFERENCE BOUNDS. The ends of the arc
      // mean "significantly below" and "significantly above" — states rather
      // than quantities — so a figure at each end would label a position that no
      // longer corresponds to it.
      const range = g.label.match(/reference range ([\d.]+)[–-]([\d.]+)/);
      expect(range, `the gauge did not state its range in words: ${g.label}`).not.toBeNull();
      expect(g.figures.map(Number).sort((a, b) => a - b)).toEqual([Number(range![1]), Number(range![2])]);

      // IT NEVER PAINTS OUTSIDE ITS OWN BOX. The mark overhangs the ring by half
      // its width, which is exactly what the gutter round the ring is for.
      expect(g.markBox, 'the mark did not render').not.toBeNull();
      expect(g.markBox!.left).toBeGreaterThanOrEqual(g.box.left - 1);
      expect(g.markBox!.right).toBeLessThanOrEqual(g.box.right + 1);
      expect(g.markBox!.top).toBeGreaterThanOrEqual(g.box.top - 1);
      expect(g.markBox!.bottom).toBeLessThanOrEqual(g.box.bottom + 1);

      await ctx.close();
    });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. THE SAME PICTURE ON EVERY CARD — over a real report, not a fixture.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the assertion the rebuild exists for, and it is the one that has to be
 * made against a WHOLE PAGE rather than a component: the failure it replaces was
 * invisible on any single gauge and unmissable on a grid of them.
 *
 * Every gauge the marker list renders, in one pass: identical rings, mark in the
 * band its own label names, never at an end, and no figures at all on a card.
 */
for (const size of SIZES) {
  test(`every gauge on the marker list paints the same ring at ${size.at}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await context(browser, 'dark', size);
    const page = await ctx.newPage();
    await page.goto('/results?view=by-marker');
    await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);

    const gauges = await readGauges(page);
    expect(gauges.length, 'the marker list drew no gauges').toBeGreaterThan(20);

    const statuses = new Set(gauges.map((g) => (g.label.match(/status:\s*(.+)$/i)?.[1] ?? '').trim().toLowerCase()));
     
    console.log(
      `\n  ${size.at}: ${gauges.length} gauges across ${statuses.size} distinct states ` +
        `(${[...statuses].join(', ')}), first is ${Math.round(gauges[0].box.width)}px`,
    );
    // The check is only worth anything if the page actually contains gauges in
    // different states — a grid of 40 in-range results would pass a broken build.
    expect(statuses.size, 'every gauge on the page is in the same state, so this proves nothing').toBeGreaterThan(2);

    // ⚠ IDENTICAL, not similar. A ring that is a function of its value is the
    // bug this replaced; anything weaker than string equality would pass a
    // version that had crept part of the way back toward it.
    for (const g of gauges) {
      expect(g.gradient, 'two gauges on one page painted different rings').toBe(gauges[0].gradient);
    }

    for (const g of gauges) {
      const status = (g.label.match(/status:\s*(.+)$/i)?.[1] ?? '').trim().toLowerCase();
      const slice = SLICE[status];
      if (!slice) continue; // a card with no status draws no gauge; skip rather than fail
      expect(g.markAt, `"${status}" at ${((g.markAt ?? 0) * 100).toFixed(1)}% is outside its own slice`).toBeGreaterThanOrEqual(
        slice[0] - 0.005,
      );
      expect(g.markAt!).toBeLessThanOrEqual(slice[1] + 0.005);
      expect(g.markAt!).toBeGreaterThan(0);
      expect(g.markAt!).toBeLessThan(1);

      // NO FIGURES ON A CARD. It states its reference range in words two lines
      // below, and two figures round a 176px arc sit closer to the value in the
      // middle than to the hairlines they would be naming. The HAIRLINES stay.
      expect(g.figures, `a card gauge printed ${g.figures.length} figures`).toEqual([]);
      expect(g.hairlines.length, 'a card gauge lost its boundary hairlines').toBeGreaterThanOrEqual(4);
    }

    await ctx.close();
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOTHING DIMS THE ARC, AND IT IS MEASURED RATHER THAN REASONED (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE COMPLAINT THIS ANSWERS: the gauge's yellow reads darker in dark mode than
 * its token says, and the suspicion was an overlay. The five fills are
 * byte-identical in the two themes and `tokenContrast.test.ts` asserts that at
 * the token layer — but a token is not a pixel, and every previous pass at this
 * argued about the value when the fault could have been anywhere between the
 * value and the paint.
 *
 * So the whole chain is checked, in both themes, off the rendered page:
 *
 *  1. THE RING'S OWN STYLE. `opacity`, `mix-blend-mode`, `filter`, and no alpha
 *     in any gradient stop.
 *  2. EVERY ANCESTOR UP TO THE DOCUMENT ROOT. `opacity`, `filter` and
 *     `mix-blend-mode` on an ancestor reach down and CANNOT be undone from the
 *     ring, so a declaration on the ring itself proves nothing on its own. This
 *     is the half that a component test structurally cannot see.
 *  3. WHAT IS ACTUALLY ON TOP OF ITS PIXELS. `elementsFromPoint` at four points
 *     around the ring returns the real hit-test stack, which is the browser's
 *     own answer to "what is above this" rather than an inference from z-index
 *     and stacking contexts. The page grain, the two ambient glows, the vignette
 *     and the panes' streak and grain are all `z-index: -1` and should therefore
 *     be nowhere in it.
 *
 * ⚠ THE FOUR BOUNDARY HAIRLINES ARE ALLOWED ABOVE IT and are the only things
 * that are. They are marks ON the arc rather than a layer over it — the
 * greyscale carrier the status rules require, one theme-independent colour over
 * one theme-independent band, so their composite is identical in both themes
 * too. They are 1px lines: four of them across a ring some 460px long and 9.7px
 * wide is under 1% of its area.
 */
for (const theme of ['light', 'dark'] as const) {
  test(`nothing dims or overlays the arc in ${theme}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await context(browser, theme, SIZES[0]);
    const page = await ctx.newPage();
    await aMarkerWithAGauge(page, ctx.request);

    const audit = await page.evaluate(() => {
      const ring = document.querySelector('.arc-gauge__ring') as HTMLElement | null;
      if (!ring) return null;
      const own = getComputedStyle(ring);

      // Every ancestor, because these three are not the ring's to control.
      const inherited: { tag: string; cls: string; opacity: string; filter: string; blend: string }[] = [];
      for (let el = ring.parentElement; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.opacity !== '1' || s.filter !== 'none' || s.mixBlendMode !== 'normal') {
          inherited.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className?.toString().slice(0, 60) ?? '',
            opacity: s.opacity,
            filter: s.filter,
            blend: s.mixBlendMode,
          });
        }
      }

      // WHAT IS ACTUALLY ABOVE THE PAINTED RING. Four points on its centreline,
      // clear of the 90° gap at the bottom and of the four hairlines.
      const box = ring.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const r = box.width / 2 - 5;
      const above: string[] = [];
      for (const deg of [160, 225, 290, 20]) {
        const rad = (deg * Math.PI) / 180;
        const stack = document.elementsFromPoint(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
        const i = stack.indexOf(ring);
        if (i < 0) continue;
        for (const el of stack.slice(0, i)) {
          above.push(`${el.tagName.toLowerCase()}.${el.className?.toString().split(/\s+/)[0] ?? ''}`);
        }
      }

      return {
        opacity: own.opacity,
        filter: own.filter,
        blend: own.mixBlendMode,
        background: own.backgroundImage,
        inherited,
        above: [...new Set(above)],
      };
    });

    expect(audit, 'no arc gauge rendered').toBeTruthy();
     
    console.log(`\n  ${theme}: ring opacity ${audit!.opacity}, filter ${audit!.filter}, blend ${audit!.blend}`);
    console.log(`  ${theme}: above the ring → ${audit!.above.length ? audit!.above.join(', ') : 'nothing'}`);

    expect(audit!.opacity, 'the ring is not fully opaque').toBe('1');
    expect(audit!.filter, 'the ring carries a filter').toBe('none');
    expect(audit!.blend, 'the ring carries a blend mode').toBe('normal');
    // No alpha in any stop, as the browser resolved them. `rgb(a, b, c)` is
    // what Chromium serialises an opaque colour to; a fourth component or an
    // `rgba(` is a stop somebody put an alpha on.
    const stops = audit!.background.match(/rgba?\([^)]*\)/g) ?? [];
    for (const s of stops) {
      expect(s, `a gradient stop carries an alpha: ${s}`).not.toMatch(/rgba\(|\/\s*0?\.\d/);
    }
    expect(
      audit!.inherited,
      `an ancestor dims the ring: ${JSON.stringify(audit!.inherited)}`,
    ).toEqual([]);
    expect(
      audit!.above,
      `something paints over the arc: ${audit!.above.join(', ')}`,
    ).toEqual([]);

    await ctx.close();
  });
}
