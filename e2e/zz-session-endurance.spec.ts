import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * ===========================================================================
 *  A SESSION IN USE SURVIVES LONGER THAN THE TOKEN THAT CARRIES IT.
 * ===========================================================================
 *
 * The regression this exists for: a patient moving around the portal was
 * signed out about fifteen minutes after signing in, mid-use, with no warning
 * and nothing wrong with the idle window. Every route change restarted the
 * client's token-rotation clock (see the note at the top of SessionGuard.tsx),
 * so the rotation never reached ten minutes, and the access token lapsed on its
 * own 15-minute TTL.
 *
 * MEASURED, BEFORE THE FIX, by this exact script:
 *
 *     t+ 922s  401  /api/auth/me
 *     t+ 922s  >>> BOUNCED TO /login
 *     after 16 minutes: SIGNED OUT
 *     /auth/refresh calls in the whole run: 0
 *     /auth/activity calls in the whole run: 0
 *
 * `sessionClock.test.ts` pushes three hours of simulated use through the same
 * decisions in a millisecond and is the test that runs on every commit. This
 * one is the other half and cannot be simulated: whether those decisions are
 * still being REACHED once React, the router and the browser are involved. It
 * is a wall-clock test and it costs the wall clock — eighteen minutes, past the
 * 15-minute access token, which is the shortest span that can prove anything.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SESSION=1`.
 */

const RUN = process.env.E2E_SESSION === '1';
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** Past the 15-minute access token, with a margin for a slow tick. */
const RUN_MINUTES = 18;

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

test.describe('session endurance', () => {
  test.skip(!RUN, 'set E2E_SESSION=1 to run the wall-clock session test');
  test.describe.configure({ timeout: (RUN_MINUTES + 12) * 60 * 1000 });

  test('a patient using the portal is not signed out past the access token TTL', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();

    const started = Date.now();
    const at = () => Math.round((Date.now() - started) / 1000);
    const refreshes: number[] = [];
    const pings: number[] = [];
    const unauthorised: string[] = [];
    page.on('response', (r) => {
      const path = new URL(r.url()).pathname;
      if (path === '/api/auth/refresh' && r.ok()) refreshes.push(at());
      if (path === '/api/auth/activity' && r.ok()) pings.push(at());
      if (r.status() === 401) unauthorised.push(`t+${at()}s ${path}`);
    });

    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
      timeout: 30_000,
    });

    /**
     * ORDINARY USE, AND THE CADENCE IS THE POINT. A route change every thirty
     * seconds is what reading your own results looks like, and it is also what
     * used to reset the rotation clock before it could ever fire — so a test
     * that sat on one page would have passed against the broken build.
     *
     * CLICKED, NEVER `page.goto`. The first version of this used `goto`, which
     * is a full document load: the whole app remounts, every timer in it starts
     * again from zero, and the run fails identically whether the bug is present
     * or not. It measured the harness rather than the fix. A patient clicks
     * links, the router handles it in the page, and nothing remounts — which is
     * the case the bug actually lived in.
     */
    const links = ['Results', 'Overview', 'Understanding results', 'Documents'];
    for (let i = 0; at() < RUN_MINUTES * 60; i += 1) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(15_000);
      await page
        .getByRole('link', { name: links[i % links.length], exact: true })
        .first()
        .click({ timeout: 10_000 })
        .catch(() => undefined);
      await page.waitForTimeout(15_000);
      if (page.url().includes('/login')) break;
    }

    console.log(
      `\n  ${RUN_MINUTES} minutes of use:\n` +
        `    token rotations : ${refreshes.length} (at t+${refreshes.join('s, t+')}s)\n` +
        `    activity pings  : ${pings.length}\n` +
        `    401s            : ${unauthorised.length ? unauthorised.join(', ') : 'none'}\n`,
    );

    expect(page.url(), 'the session ended mid-use').not.toContain('/login');
    expect(unauthorised, 'an authenticated request was rejected during ordinary use').toEqual([]);
    // The rotation is what actually broke, so it is asserted directly rather
    // than only through its consequence: eighteen minutes at a ten-minute
    // cadence is at least one.
    expect(refreshes.length, 'the access token was never rotated').toBeGreaterThanOrEqual(1);
    // And still signed in as the same person, not merely still on a page.
    const me = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      return { ok: r.ok, status: r.status };
    });
    expect(me.ok, `/auth/me answered ${me.status} at the end of the run`).toBe(true);

    await ctx.close();
  });

  test('and neither is one who reloads the page more often than the token rotates', async ({ browser }) => {
    /**
     * THE VARIANT THE FIRST VERSION OF THE TEST ABOVE ACCIDENTALLY FOUND.
     *
     * A full page load starts every client timer again, so somebody reloading
     * every few minutes never reaches a ten-minute rotation either — and the
     * access token lapses on its own wall clock exactly as before. No timer
     * cadence can fix that, because the timer is what is being reset.
     *
     * What fixes it is that a lapsed access token is no longer an event a
     * reader can see: a 401 that is not an idle timeout buys one silent
     * rotation and one retry (see lib/api.ts). This asserts that, at the only
     * cadence that can prove it — reloads closer together than the rotation
     * interval, for longer than the token lives.
     */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();

    const started = Date.now();
    const at = () => Math.round((Date.now() - started) / 1000);
    const unauthorised: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 401) unauthorised.push(`t+${at()}s ${new URL(r.url()).pathname}`);
    });

    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
      timeout: 30_000,
    });

    while (at() < RUN_MINUTES * 60) {
      await page.waitForTimeout(150_000);
      await page.reload().catch(() => undefined);
      if (page.url().includes('/login')) break;
    }

    console.log(
      `\n  ${RUN_MINUTES} minutes of reloading every 2.5 minutes:\n` +
        `    401s seen: ${unauthorised.length ? unauthorised.join(', ') : 'none'}` +
        `  (a rotated-and-retried one is expected and is not a sign-out)\n`,
    );
    expect(page.url(), 'reloading ended the session').not.toContain('/login');
    const me = await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).ok);
    expect(me, 'the session did not survive the reloads').toBe(true);

    await ctx.close();
  });
});
