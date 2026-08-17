import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';

/**
 * ===========================================================================
 *  THE PAGE-SURFACE PANE, AND THE TWO AMBIENT SOURCES.
 * ===========================================================================
 *
 * ── WHY THIS IS MEASURED AND NOT REVIEWED ──────────────────────────────────
 *
 * A screenshot cannot settle any of it, and that is not a general principle —
 * it is specific to these two effects and it has caught real faults before:
 *
 *  · THE BACKDROP FILTER IS INVISIBLE TO A SCREENSHOT. Blurring what is behind
 *    an element shows nothing when what is behind it is a flat colour and two
 *    smooth radials, which is most of this page. Worse, the failure is SILENT:
 *    the declaration is `blur(var(--glass-blur)) saturate(var(--glass-saturate))`,
 *    so ONE missing custom property makes the whole declaration invalid and the
 *    browser drops it to `none` with no warning anywhere.
 *  · A GLOW AT `z-index: -1` CANNOT BE ASSERTED FROM A PIXEL either, because
 *    what matters is not that it is there but that it is one of TWO, in two
 *    hues, in corners far enough apart that no pixel carries both — which is
 *    the whole basis on which `tokenContrast.test.ts` is allowed to check the
 *    corners one at a time.
 *
 * ── AND THE BOUNDARY IS ASSERTED, NOT ONLY THE MATERIAL ────────────────────
 *
 * The interesting half of "which surfaces are glass" is which are NOT. A
 * Signature report draws 165 marker result cards, each with a status tint under
 * it, and 165 panes with 165 specular streaks travelling across them is not a
 * material, it is a texture over the one surface in the product whose colour is
 * a clinical statement. So the negative is checked as hard as the positive.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

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

async function context(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

for (const theme of ['light', 'dark'] as const) {
  test(`three ambient sources, in three hues, at three corners — ${theme}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await context(browser, theme);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    const glow = await page.evaluate(() => {
      const s = getComputedStyle(document.body, '::before');
      return {
        image: s.backgroundImage,
        position: s.position,
        zIndex: s.zIndex,
        pointerEvents: s.pointerEvents,
        attachment: s.backgroundAttachment,
      };
    });

    // eslint-disable-next-line no-console
    console.log(`\n  ${theme}: body::before is ${glow.position}, z-index ${glow.zIndex}`);

    // THREE SOURCES (Aug 2026). Both themes — light mode used to be flat cream
    // with nothing happening in it, which is the same complaint the dark page
    // had before any of this existed, and the answer is the same answer.
    const radials = [...glow.image.matchAll(/radial-gradient\(/g)].length;
    const expected = theme === 'dark' ? 4 : 3; // dark carries the vignette as well
    expect(radials, `${theme}: expected ${expected} radials on body::before, got ${radials}`).toBe(expected);

    // AT THREE CORNERS. They overlap now, which is why the contrast suite
    // samples the whole viewport rather than checking each core.
    expect(glow.image, 'the key light is not anchored at the top right').toContain('96% 1%');
    // 20% 50%, and BOTH halves are deliberate. The x: the patient shell's
    // sidebar is 288px, which is 20% of a 1440 viewport, so a fill anchored at
    // the literal left edge has its CORE — the only part of the ramp that is
    // genuinely bright — behind an opaque column, and the second light exists
    // nowhere the reader can see it. The y: it was at 98%, i.e. a light in the
    // bottom-left corner; at the vertical centre it reads as light coming from
    // BESIDE the sidebar rather than from under the page.
    expect(glow.image, 'the fill light is not anchored at the middle left').toContain('20% 50%');
    // The green IS at its corner, because nothing opaque covers the bottom
    // right — the asymmetry with the fill is the sidebar and nothing else.
    expect(glow.image, 'the green light is not anchored at the bottom right').toContain('99% 99%');

    // IN THREE HUES. A second light the colour of the first is a wider first
    // light, which is exactly the failure the original pair of viewport-sized
    // radials had. The ramps must not be built from one colour.
    const colours = new Set([...glow.image.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) => `${m[1]},${m[2]},${m[3]}`));
    expect(colours.size, `${theme}: the sources resolved to ${colours.size} distinct colour(s)`).toBeGreaterThanOrEqual(3);

    // BEHIND EVERYTHING, FIXED, INERT. It may never intercept a click and it
    // may never travel on scroll.
    expect(glow.position).toBe('fixed');
    expect(Number(glow.zIndex)).toBeLessThan(0);
    expect(glow.pointerEvents).toBe('none');

    // AND THE SHELL MAY NOT PAINT OVER IT. This is the trap that hid the glow
    // on every signed-in screen once already: the shell roots carried `bg-cream`
    // and drew an opaque sheet over `body::before`.
    const opaqueOverlay = await page.evaluate(() => {
      const main = document.querySelector('main');
      const shell = main?.parentElement;
      const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : '');
      return [bg(document.body), bg(shell), bg(main)].filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && !c.endsWith(', 0)'));
    });
    expect(opaqueOverlay, `something between body and main paints over the glow: ${opaqueOverlay.join(' ')}`).toEqual([]);

    // ── AND THE DIAGONAL RIBBON, WHICH IS A SEPARATE ELEMENT ───────────────
    // Five soft blobs on `html::before` whose centres follow a bowed diagonal
    // from the top left to the bottom right. It is on `html` rather than as a
    // sixth layer of `body::before` for a reason a screenshot cannot check:
    // `body` creates a stacking context, so everything it paints — including
    // its own z-index:-1 pseudo-elements — is painted ABOVE any positioned box
    // of `html`. That is what puts the ribbon under the three radials, under
    // the grain, and under every scrap of content.
    const ribbon = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement, '::before');
      return { image: s.backgroundImage, position: s.position, pointerEvents: s.pointerEvents };
    });
    const blobs = [...ribbon.image.matchAll(/radial-gradient\(/g)].length;
    expect(blobs, `${theme}: expected 5 blobs in the ribbon, got ${blobs}`).toBe(5);
    // The bow: the middle blob is ABOVE the straight line between the two ends,
    // which is what makes it a curve rather than a diagonal bar.
    for (const at of ['4% 8%', '32% 20%', '56% 38%', '78% 62%', '96% 92%']) {
      expect(ribbon.image, `the ribbon has no blob at ${at}`).toContain(at);
    }
    expect(ribbon.position).toBe('fixed');
    expect(ribbon.pointerEvents).toBe('none');
    // It resolved to a colour rather than to nothing: `rgb(var(--x))` with a
    // missing custom property is dropped silently, which is the failure mode
    // this whole token layer is written to make impossible.
    expect(ribbon.image, `${theme}: the ribbon resolved to no colour at all`).toMatch(/rgba?\(\d+, \d+, \d+/);

    await ctx.close();
  });

  test(`the page-surface pane is the glass material — ${theme}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await context(browser, theme);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const pane = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.glass-panel');
      if (!el) return null;
      const s = getComputedStyle(el);
      const streak = getComputedStyle(el, '::before');
      const grain = getComputedStyle(el, '::after');
      return {
        background: s.backgroundColor,
        filter: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter,
        border: s.borderTopColor,
        streak: streak.backgroundImage,
        streakZ: streak.zIndex,
        grainOpacity: Number(grain.opacity),
        grainBlend: grain.mixBlendMode,
        grainZ: grain.zIndex,
      };
    });
    expect(pane, 'no glass pane on the Overview').not.toBeNull();

    // eslint-disable-next-line no-console
    console.log(`\n  ${theme} pane: ${pane!.background}, filter ${pane!.filter}, grain ${pane!.grainOpacity}`);

    // TRANSLUCENT OVER A BACKDROP BLUR. The alpha is the point: an opaque fill
    // would paint over both sources, which is the thing glass exists to avoid.
    const alpha = Number(pane!.background.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/)?.[1] ?? '1');
    expect(alpha, `the pane is opaque (${pane!.background})`).toBeLessThan(1);
    expect(alpha, `the pane is barely there (${pane!.background})`).toBeGreaterThan(0.4);

    // ⚠ THE SILENT FAILURE. One missing custom property invalidates the whole
    // declaration and the browser drops it to `none` with no warning at all.
    expect(pane!.filter, 'the pane has no backdrop filter — check for a missing custom property').toMatch(/blur\(/);
    expect(pane!.filter).toMatch(/saturate\(/);
    expect(pane!.filter).not.toBe('none');

    // THE SPECULAR STREAK, and it is UNDER the content rather than over it. An
    // absolutely-positioned pseudo-element at `auto` paints after in-flow
    // content, which would put a sheet of light over the reader's own results.
    expect(pane!.streak, 'the pane has no specular streak').toContain('linear-gradient');
    expect(pane!.streak).toContain('208deg');
    expect(Number(pane!.streakZ), 'the streak paints over the content instead of under it').toBeLessThan(0);

    // THE GRAIN. Invisible as texture, visible in its absence — and soft-light
    // rather than a plain alpha, because grey noise at any opacity LIFTS a dark
    // surface toward grey instead of texturing it.
    expect(pane!.grainOpacity).toBeGreaterThan(0);
    expect(pane!.grainOpacity, 'the grain is visible as texture').toBeLessThan(0.08);
    expect(pane!.grainBlend).toBe('soft-light');
    expect(Number(pane!.grainZ)).toBeLessThan(0);

    await ctx.close();
  });
}

/**
 * ── THE BOUNDARY, AND IT NARROWED TO ONE CLAUSE (Aug 2026) ─────────────────
 *
 * It used to be two: a surface is a PANE if it is one of a handful of containers
 * a screen is built from, and an ordinary CARD if it is one of many instances of
 * a repeating object OR if it carries a status colour. Glass is the DEFAULT now,
 * so the first clause is gone and what is left is the one that was doing the
 * work: a status tint is a statement about somebody's blood, and a translucent
 * sheet with a moving highlight over it makes the one surface in the product
 * whose colour means something the least legible of the lot.
 *
 * A narrower rule and a better one — it names the reason rather than the count,
 * and `Card` enforces it rather than forty call sites remembering it.
 */
test('a card carrying a status tint is never a pane', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await context(browser, 'dark');
  const page = await ctx.newPage();
  await page.goto('/results?view=by-marker');
  await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const counts = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('a[href^="/markers/"] .card')];
    // A tint is applied as `bg-tint-*`, and it is the one thing that must never
    // sit under a translucent sheet — see Card.tsx, which refuses the pair.
    const tinted = cards.filter((c) => [...c.classList].some((n) => n.startsWith('bg-tint-')));
    const isPane = (c: HTMLElement) => {
      const f = getComputedStyle(c).backdropFilter;
      return c.classList.contains('glass-panel') || (Boolean(f) && f !== 'none');
    };
    return {
      cards: cards.length,
      tinted: tinted.length,
      tintedPanes: tinted.filter(isPane).length,
      untintedPanes: cards.filter((c) => !tinted.includes(c)).filter(isPane).length,
    };
  });

  // eslint-disable-next-line no-console
  console.log(
    `\n  ${counts.cards} marker result cards: ${counts.tinted} tinted (${counts.tintedPanes} of them panes), ` +
      `${counts.untintedPanes} untinted panes`,
  );

  expect(counts.cards, 'the marker list drew no cards').toBeGreaterThan(20);
  expect(counts.tinted, 'no card on the marker list carried a status tint at all').toBeGreaterThan(10);
  // ⚠ THE WHOLE RULE. Glass is the default surface now, so what is asserted is
  // not "result cards are opaque" — most of them are, because most of them carry
  // a status — but the thing that actually matters: a clinical colour is never
  // read through a translucent sheet with a moving highlight on it.
  expect(counts.tintedPanes, 'a status-tinted card became a pane').toBe(0);

  await ctx.close();
});

/**
 * ── WHAT THE PANES COST TO SCROLL PAST ─────────────────────────────────────
 *
 * The number is REPORTED rather than asserted against, for the reason already
 * recorded on `GLASS.blur`: this is headless Chromium, which rasterises in
 * software, and a backdrop filter there is close to a worst case rather than
 * close to what a patient's browser does. A threshold that failed at 29fps and
 * passed at 31 would be a fact about the machine it ran on.
 *
 * What IS asserted is the comparison — the panes must not cost more than the
 * glass that was already on the page — because that is the question adding them
 * actually raised, and it is machine-independent.
 */
test('the cost of scrolling a long list past the panes', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await context(browser, 'dark');
  const page = await ctx.newPage();
  await page.goto('/results?view=by-marker');
  await page.locator('a[href^="/markers/"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  async function profile() {
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
          // A steady scroll rather than one jump: a backdrop filter costs per
          // FRAME it is composited on, so it only shows up under movement.
          window.scrollBy(0, 24);
          if (now - start > 3000) return resolve();
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
      const deltas = frames.slice(1);
      const total = deltas.reduce((a, b) => a + b, 0);
      const sorted = [...deltas].sort((a, b) => a - b);
      return {
        fps: Math.round((deltas.length / total) * 1000),
        medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
        dropped: deltas.filter((d) => d > 20).length,
      };
    });
  }

  const cardCount = await page.locator('.card').count();
  const paneCount = await page.locator('.glass-panel').count();

  const asShipped = await profile();

  // Only the PANES taken out, leaving the sidebar and the pinned bar exactly as
  // they are — so the difference is the thing that was added and nothing else.
  await page.addStyleTag({
    content: '.glass-panel { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
  });
  await page.waitForTimeout(400);
  const withoutPanes = await profile();

  // And with every backdrop filter on the page gone, as the floor.
  await page.addStyleTag({
    content:
      '.glass, .glass-panel, .panel-wash { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
  });
  await page.waitForTimeout(400);
  const noGlassAtAll = await profile();

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `  ${cardCount} cards, ${paneCount} panes, 3s continuous scroll, headless Chromium (software raster)`,
      `    as shipped        ${asShipped.fps} fps · median ${asShipped.medianMs}ms · ${asShipped.dropped} frames over 20ms`,
      `    panes unfiltered  ${withoutPanes.fps} fps · median ${withoutPanes.medianMs}ms · ${withoutPanes.dropped} frames over 20ms`,
      `    no glass at all   ${noGlassAtAll.fps} fps · median ${noGlassAtAll.medianMs}ms · ${noGlassAtAll.dropped} frames over 20ms`,
      '',
    ].join('\n'),
  );

  // The panes are on a page that already had glass on it. Adding them must not
  // be the thing that costs the frames — a 15% allowance for run-to-run noise on
  // a 3-second sample.
  expect(
    asShipped.fps,
    `the panes cost ${withoutPanes.fps - asShipped.fps} fps against the same page with only their filter removed`,
  ).toBeGreaterThan(withoutPanes.fps * 0.85);

  await ctx.close();
});
