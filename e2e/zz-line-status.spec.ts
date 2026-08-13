import { test, type APIRequestContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * THE TREND CHART'S LINE, ON A MARKER THAT CROSSES TWO BOUNDARIES.
 *
 * The line carries the status along its length now and the bands dropped back
 * to context, which is a change that can only be judged by looking at it — so
 * this crops the plot itself, tightly, in both themes, on markers chosen
 * because their series actually changes state.
 *
 * `FREE ANDROGEN INDEX` is the one to look at: in range, then significantly
 * high, then high, so the line crosses a REFERENCE BOUND and a SEVERITY
 * THRESHOLD and shows all three hues on one path. `TOTAL IRON BINDING
 * CAPACITY` crosses the low bound and the high bound in four points, which is
 * the other shape a series takes.
 *
 * Written to `screenshots/line/`, `E2E_LINE=1`, asserts nothing — the other
 * specs make the claims, this one produces the evidence.
 */

const RUN = process.env.E2E_LINE === '1';
const OUT = path.resolve('screenshots/line');
/** `before` or `after` — so one run does not overwrite the other's evidence. */
const STAGE = process.env.E2E_LINE_STAGE ?? 'after';

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** Chosen for the states they pass through, not for their names. */
const MARKERS = [
  { slug: 'fai', name: 'Free Androgen Index' },
  { slug: 'tibc', name: 'Total Iron Binding Capacity' },
];

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
}

async function themed(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* ignore */
    }
  }, theme);
  return ctx;
}

test.describe('the status-carrying line', () => {
  test.skip(!RUN, 'set E2E_LINE=1');
  test.describe.configure({ timeout: 300_000 });

  test('the plot, cropped, on markers that change state', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await themed(browser, theme);
      await login(ctx.request);
      const page = await ctx.newPage();

      const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
        markerId: string;
        name: string;
      }[];

      for (const target of MARKERS) {
        const marker = markers.find((m) => m.name === target.name);
        if (!marker) {
          console.log(`  no marker named ${target.name} on this patient`);
          continue;
        }
        await page.goto(`/markers/${marker.markerId}`);
        await page.getByText('Trend over time').first().waitFor({ timeout: 30_000 });
        // The line draws on mount and the bands fade up under it; a shot taken
        // mid-animation is a picture of the animation.
        await page.waitForTimeout(2200);

        // The CARD, not the whole page: the plot plus its key and the sentence
        // under it, which is everything this change touches.
        const card = page.locator('main .card', { hasText: 'Trend over time' }).first();
        await card.screenshot({ path: path.join(OUT, `${STAGE}-${target.slug}-${theme}.png`) });

        // And the plot alone, tight, because the whole question is how the line
        // reads against the bands rather than how the card is laid out.
        const svg = card.locator('svg.recharts-surface').first();
        await svg.screenshot({ path: path.join(OUT, `${STAGE}-${target.slug}-${theme}-plot.png`) });

        const states = await page.evaluate(() => {
          const img = document.querySelector('[role="img"][aria-label^="Trend chart"]');
          return img?.getAttribute('aria-label')?.slice(0, 400) ?? '';
        });
        console.log(`  ${STAGE} ${target.slug} ${theme}: ${states}`);
      }

      await ctx.close();
    }
  });
});
