import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';

/**
 * ===========================================================================
 *  THE MARKER PAGE'S TWO CARDS FIT ONE LAPTOP SCREEN.
 * ===========================================================================
 *
 * "Latest result" and "Trend over time" are one row of two cards, 40/60, and
 * the whole argument for the row is that the number and the shape it sits at
 * the end of are ONE answer read side by side. Push them past the fold and
 * they are two screens again, with the second one below it.
 *
 * So the requirement is a MEASUREMENT and not a preference: at 1440 × 900 the
 * pair ends above the fold, with the page header still visible, and no scroll
 * is needed to reach either card.
 *
 * ── WHY THIS FILE EXISTS AT ALL (Aug 2026) ─────────────────────────────────
 *
 * `TrendChart`'s own comment has cited a spec for this figure through two
 * different heights (30rem, then 22rem, now 28rem) and the spec it named,
 * `zz-label-scale-shots.spec.ts`, is not in the repository. So the number that
 * governs how tall the chart may be has been protected by a comment pointing
 * at a file that does not exist — which is worse than nothing, because it reads
 * as covered.
 *
 * THREE FACTS, and each of them is a number somebody would otherwise have to
 * re-derive by eye:
 *
 *  1. THE PAIR FITS. Both cards end inside 900px with the header above them.
 *  2. THE TWO CARDS ARE THE SAME HEIGHT. That is what a grid row does on its
 *     own (`align-items: stretch`) and it is what breaks the moment somebody
 *     puts a height or an `mt-auto` on one of them — which has happened, and
 *     which opened a dead zone in the middle of the shorter card.
 *  3. THE SPLIT IS 40/60. Five columns, two and three. The chart is the reason
 *     to be on this page and gets the larger share; a 50/50 row would be the
 *     two treated as equal weight, which they are not.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** The laptop this is designed against, and the one most patients read it on. */
const VIEWPORT = { width: 1440, height: 900 };

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

async function measure(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a private window without storage is not a reason to fail */
    }
  }, theme);
  await signIn(ctx.request);
  const page = await ctx.newPage();

  const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
    markerId: string;
    name: string;
    resultType?: string;
    resultCount: number;
  }[];
  // A marker with HISTORY, so the left card carries its previous-results list
  // and the right card has a line to draw. A single-result marker is the easy
  // case and would pass a check the real one fails.
  const withHistory = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2);
  expect(withHistory.length, 'no marker has more than one result — run the demo seed').toBeGreaterThan(0);

  await page.goto(`/markers/${withHistory[0].markerId}`);
  await page.getByText('Trend over time').waitFor({ timeout: 30_000 });
  // The chart animates in on mount and the range bar sweeps to position; both
  // settle well inside this, and measuring mid-animation is measuring nothing.
  await page.waitForTimeout(1200);

  const geometry = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')].slice(0, 2).map((c) => c.getBoundingClientRect());
    const heading = document.querySelector('h1')?.getBoundingClientRect();
    return {
      cards: cards.map((r) => ({
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      })),
      headingTop: heading ? Math.round(heading.top) : null,
      scrollY: Math.round(window.scrollY),
      documentTallerThanViewport: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  await ctx.close();
  return geometry;
}

for (const theme of ['light', 'dark'] as const) {
  test(`the marker page's two cards fit a 1440x900 viewport in ${theme} mode`, async ({ browser }) => {
    test.setTimeout(120_000);
    const g = await measure(browser, theme);
    expect(g.cards.length, 'expected two cards on the marker page').toBe(2);

    // eslint-disable-next-line no-console
    console.log(
      `\n  ${theme}: ${g.cards.map((c) => `${c.width}x${c.height}`).join(' + ')}, ` +
        `pair ends at ${Math.max(...g.cards.map((c) => c.bottom))} of ${VIEWPORT.height}`,
    );

    // 1. THE PAIR FITS, unscrolled.
    expect(g.scrollY, 'the page had already scrolled before anything was measured').toBe(0);
    for (const [i, card] of g.cards.entries()) {
      expect(card.bottom, `card ${i + 1} ends at ${card.bottom}, past the fold at ${VIEWPORT.height}`).toBeLessThanOrEqual(
        VIEWPORT.height,
      );
    }
    // ...with the page header still above them. A pair that fits because the
    // heading scrolled off is not the thing being protected.
    expect(g.headingTop, 'the marker name is not on screen above the pair').not.toBeNull();
    expect(g.headingTop!, 'the marker name has scrolled off the top').toBeGreaterThanOrEqual(0);
    expect(g.headingTop!, 'the marker name is below the cards').toBeLessThan(g.cards[0].top);

    // 2. SAME HEIGHT, driven by content. `align-items: stretch` gives this for
    //    free and an `h-` or an `mt-auto` on either card takes it away.
    expect(g.cards[0].height, 'the two cards are not the same height').toBe(g.cards[1].height);
    expect(g.cards[0].top, 'the two cards do not start on the same line').toBe(g.cards[1].top);

    // 3. 40/60. Five columns split two and three, so the chart — the reason to
    //    be on this page — gets the larger share. Measured as a ratio rather
    //    than as two pixel widths, which change with the sidebar's own state.
    const share = g.cards[1].width / (g.cards[0].width + g.cards[1].width);
    expect(share, `the chart card takes ${(share * 100).toFixed(1)}% of the row`).toBeGreaterThan(0.55);
    expect(share, `the chart card takes ${(share * 100).toFixed(1)}% of the row`).toBeLessThan(0.65);
  });
}
