import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * ===========================================================================
 *  THE RESULTS-READY MOMENT FIRES ONCE, AND THEN NEVER.
 * ===========================================================================
 *
 * A patient with a newly released report they have not opened gets one
 * full-screen moment before the Overview. The failure this spec exists for is
 * the moment firing on EVERY sign-in — which is what happens the instant the
 * condition is keyed on something that resets: a session, a token, a flag in
 * localStorage. It is keyed on `Report.resultsReadySeenAt`, a column on the
 * report, which resets never.
 *
 * ITS OWN PATIENT AND ITS OWN REPORT, rather than the seeded demo account.
 * "Has this person seen this report" is one-way and permanent by design, so a
 * spec that borrowed the demo patient would pass exactly once per re-seed and
 * silently pass thereafter by asserting nothing. Inviting an account and
 * publishing to it costs a few seconds and is deterministic every run.
 */

const SAMPLE = fileURLToPath(
  new URL('../apps/server/src/modules/randox/specs/HSC5-Randox-Basic-Screen-Example-Report.pdf', import.meta.url),
);

async function loginAndVerify(request: APIRequestContext, email: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

async function csrfFor(request: APIRequestContext): Promise<string> {
  const cookie = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token');
  return cookie?.value ?? '';
}

/** A patient with one released report, and nothing else. */
async function patientWithAReleasedReport(ctx: BrowserContext): Promise<{ email: string; password: string }> {
  const email = `e2e-ready-${Date.now()}@example.com`;
  const password = 'ResultsReady123!';
  const admin = ctx.request;
  await loginAndVerify(admin, 'admin@aspireshield.dev', 'DevAdminPass123!');
  const csrf = await csrfFor(admin);

  const invite = await admin.post('/api/auth/invite', { data: { email }, headers: { 'X-CSRF-Token': csrf } });
  const inviteBody = await invite.json();
  const inviteToken = new URL(inviteBody.devActivationUrl).searchParams.get('token');
  await admin.post('/api/auth/activate', {
    data: {
      inviteToken,
      password,
      profile: {
        firstName: 'Remi',
        lastName: 'Okonjo',
        sex: 'FEMALE',
        dob: '1988-04-12',
        contactNumber: '+44 7000 111222',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });

  const sources = await (await admin.get('/api/panels/sources')).json();
  const source = sources.find((s: { key: string }) => s.key === 'randox_portal') ?? sources[0];
  const upload = await admin.post('/api/reports', {
    multipart: {
      patientId: inviteBody.userId,
      sourceId: source.id,
      sampleDate: '2026-03-01',
      file: { name: 'hsc5-sample.pdf', mimeType: 'application/pdf', buffer: readFileSync(SAMPLE) },
    },
    headers: { 'X-CSRF-Token': csrf },
  });
  const created = await upload.json();
  const { rows } = created.parse;
  const publish = await admin.post(`/api/reports/${created.id}/publish`, {
    data: {
      sampleDate: '2026-03-01T00:00:00.000Z',
      confirm: true,
      results: rows
        .filter((r: { matchedMarkerId?: string; referenceLow?: number; referenceHigh?: number }) =>
          r.matchedMarkerId != null && r.referenceLow != null && r.referenceHigh != null)
        .map((r: { matchedMarkerId: string; value?: number; resultText?: string; unit: string; referenceLow: number; referenceHigh: number }) => ({
          markerId: r.matchedMarkerId,
          value: r.value ?? r.resultText,
          unit: r.unit,
          referenceLow: r.referenceLow,
          referenceHigh: r.referenceHigh,
        })),
    },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(publish.ok(), await publish.text()).toBeTruthy();
  return { email, password };
}

test('the moment shows once, and never again with no new report', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminCtx = await browser.newContext();
  const { email, password } = await patientWithAReleasedReport(adminCtx);

  // ── FIRST SIGN-IN. The moment is what "/" resolves to. ───────────────────
  const first = await browser.newContext();
  await loginAndVerify(first.request, email, password);
  const page = await first.newPage();
  await page.goto('/');
  // A patient who has never signed in meets the introduction first — the
  // moment comes after it, because announcing an answer to somebody who has
  // not been shown the question is the wrong order.
  // `waitFor` and not `isVisible({ timeout })` — isVisible takes no timeout and
  // answers immediately, so on a cold page it answers "no" before the app has
  // mounted and the click never happens.
  const skip = page.getByRole('button', { name: /^Skip this$/ });
  await skip.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  if (await skip.isVisible()) await skip.click();

  await expect(page).toHaveURL(/\/results-ready$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /your results are ready/i })).toBeVisible();
  // Their own name, not a generic greeting.
  await expect(page.getByRole('heading', { name: /Remi/ })).toBeVisible();
  // ONE button to view them. The dismissal is a link-shaped control inside the
  // arch, under the button, and is deliberately not a second button competing
  // with it.
  await expect(page.getByRole('button', { name: 'View my results' })).toBeVisible();

  // ── DISMISSING SPENDS IT. ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Not just now' }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 20_000 });
  await first.close();

  // ── SECOND SIGN-IN, NO NEW REPORT. Straight to the Overview. ─────────────
  const second = await browser.newContext();
  await loginAndVerify(second.request, email, password);
  const page2 = await second.newPage();
  await page2.goto('/');
  // The Overview itself, at "/". HomeRouter RENDERS it rather than redirecting
  // to /overview, so the assertion is what is on the screen and not the path:
  // what matters is that the moment is not what a sign-in resolves to any more.
  await expect(page2.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page2).not.toHaveURL(/\/results-ready$/);
  await expect(page2.getByRole('heading', { name: /your results are ready/i })).toHaveCount(0);

  // And it is gone from the server's own answer, not merely unrendered — the
  // check that this is a fact about the report rather than about the client.
  const me = await (await second.request.get('/api/auth/me')).json();
  expect(me.resultsReadyPending).toBe(false);

  // Typing the URL does not bring it back: with nothing waiting the screen has
  // no subject and stands aside.
  await page2.goto('/results-ready');
  await expect(page2).toHaveURL(/\/overview$/, { timeout: 20_000 });
  await second.close();
  await adminCtx.close();
});

test('opening the report by any other route spends the moment too', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminCtx = await browser.newContext();
  const { email, password } = await patientWithAReleasedReport(adminCtx);

  const ctx = await browser.newContext();
  await loginAndVerify(ctx.request, email, password);

  // Pending before anything is read.
  expect((await (await ctx.request.get('/api/auth/me')).json()).resultsReadyPending).toBe(true);

  // A patient who followed an emailed link straight to their report has seen
  // that their results are ready; telling them so on their next sign-in would
  // be the product announcing something they told it.
  // `reportId` and `patientStatus`, which is what this payload actually calls
  // them — an earlier version of this filtered on `status` and matched nothing,
  // which is the failure mode of asserting against a shape from memory.
  const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
    reportId: string;
    patientStatus: string;
  }[];
  const released = reports.find((r) => r.patientStatus === 'RELEASED');
  expect(released, 'the patient should have a released report').toBeTruthy();
  expect((await ctx.request.get(`/api/patient/reports/${released!.reportId}`)).ok()).toBeTruthy();

  expect((await (await ctx.request.get('/api/auth/me')).json()).resultsReadyPending).toBe(false);
  await ctx.close();
  await adminCtx.close();
});

/**
 * ===========================================================================
 *  THE DOORWAY STANDS ON THE FLOOR, AND ON THE READER'S OWN RESULTS.
 * ===========================================================================
 *
 * Two things a screenshot review cannot settle, which is why they are measured
 * here instead:
 *
 *  · WHETHER THE CROWN IS STILL A CIRCLE. `.arch` asks for a 9999px radius and
 *    the browser reduces it by one factor across the whole box, so at a height
 *    under half the width the two quarter-rounds separate and a FLAT TOP
 *    appears between them. That is a few pixels of difference in a shape
 *    nobody has a reference for, and it is the exact failure the brief named.
 *    Read off `border-top-left-radius` and compared with the measured width.
 *
 *  · WHETHER THE BLURRED OVERVIEW IS REACHABLE. It is thirty-odd links that
 *    cannot be seen, read or described. `aria-hidden` and `pointer-events`
 *    leave every one of them in the tab order; only `inert` does not, and
 *    whether `inert` is doing its job is a fact about the browser rather than
 *    about the markup — so the check is fifteen presses of Tab and where focus
 *    actually went.
 *
 * The frame timings at the end are PRINTED AND NOT ASSERTED, for the reason
 * given at the top of zz-render-timing.spec.ts: the machine decides the
 * number. What IS asserted is the property the freeze exists to produce —
 * that once the moment has settled, nothing inside the blurred layer is
 * running an animation at all. A blurred layer is re-rasterised in full every
 * time anything inside it changes, so "nothing changes" is the whole
 * performance argument, and it is a fact rather than a measurement.
 */
test('the moment stands on the blurred Overview, and the arch runs off the bottom', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminCtx = await browser.newContext();
  const { email, password } = await patientWithAReleasedReport(adminCtx);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await loginAndVerify(ctx.request, email, password);
  const page = await ctx.newPage();
  await page.goto('/');
  const skip = page.getByRole('button', { name: /^Skip this$/ });
  await skip.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  if (await skip.isVisible()) await skip.click();
  await expect(page).toHaveURL(/\/results-ready$/, { timeout: 20_000 });

  const backdrop = page.locator('.moment-backdrop');
  const arch = page.locator('.moment-arch');
  await expect(arch).toBeVisible();

  // ── IT IS THE REAL OVERVIEW ──────────────────────────────────────────────
  // The greeting is rendered by PatientOverview and by nothing else, so its
  // presence inside the backdrop is the check that this is that component with
  // this patient's data in it rather than an arrangement of grey boxes.
  await expect(backdrop.locator('h1')).toContainText(/Good (morning|afternoon|evening)/, { timeout: 20_000 });
  await expect(backdrop.getByText('Remi', { exact: false }).first()).toBeAttached();

  // ── AND IT IS OUT OF FOCUS ───────────────────────────────────────────────
  const plate = await page.locator('.moment-backdrop__plate').evaluate((el) => {
    const s = getComputedStyle(el);
    return { filter: s.filter, background: s.backgroundColor };
  });
  const sigma = Number(/blur\(([\d.]+)px\)/.exec(plate.filter)?.[1] ?? 0);
  expect(sigma, `the plate is not blurred: filter was "${plate.filter}"`).toBeGreaterThanOrEqual(24);
  // The plate carries the page colour, which is what stops the blur fading out
  // into transparency in a band the width of itself all round the window.
  expect(plate.background).not.toBe('rgba(0, 0, 0, 0)');
  // A glyph resolves while σ is under about its CAP HEIGHT; past that each
  // stroke is spread over more than the letter is tall and the word closes up.
  // Measured against the text actually on the page rather than a remembered
  // type scale, so a future 40px value landing on the Overview fails here
  // instead of quietly becoming readable behind the arch.
  const CAP_HEIGHT = 0.7;
  const largestValue = await backdrop.evaluate((root) =>
    Math.max(
      ...[...root.querySelectorAll('.numeric, .stat-value, .eyebrow, p, li')]
        .filter((el) => el.textContent?.trim())
        .map((el) => parseFloat(getComputedStyle(el).fontSize)),
    ),
  );
  expect(
    sigma,
    `σ=${sigma}px against a ${largestValue}px value — cap height ${Math.round(largestValue * CAP_HEIGHT)}px`,
  ).toBeGreaterThan(largestValue * CAP_HEIGHT);

  // ── NOTHING IN IT IS REACHABLE ───────────────────────────────────────────
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop).toHaveAttribute('inert', '');
  for (let i = 0; i < 15; i += 1) {
    await page.keyboard.press('Tab');
    const landed = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.closest('.moment-backdrop') ? (el.textContent ?? el.tagName).slice(0, 60) : null;
    });
    expect(landed, `Tab ${i + 1} landed inside the blurred Overview: ${landed}`).toBeNull();
  }

  // ── AND IT DOES NOT MOVE ─────────────────────────────────────────────────
  // `position: fixed`, so there is nothing behind the moment for a wheel to
  // scroll. Asserted rather than assumed, because the alternative — a scroll
  // lock on <body> — would also have trapped anybody whose window is too short
  // for the arch's content.
  const before = await backdrop.boundingBox();
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(200);
  expect(await backdrop.boundingBox()).toEqual(before);

  // ── THE ARCH, AT FOUR HEIGHTS ────────────────────────────────────────────
  const geometry = async (label: string) => {
    // The fonts and the reflow both settle first: a shape probed while the box
    // is still growing is a measurement of a transient.
    await page.waitForTimeout(400);
    const m = await arch.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const heading = el.querySelector('h1')!.getBoundingClientRect();
      const dismiss = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Not just now'));

      // THE CROWN IS HIT-TESTED AND NOT READ OFF THE COMPUTED STYLE, and that
      // is not fussiness: `border-top-left-radius` computes to the SPECIFIED
      // 9999px whatever the browser actually drew, so the one property that
      // looks like it answers this question always answers 9999. What is
      // wanted is the USED radius, which is only observable as a shape.
      //
      // Three points do it. The spring line is half the width below the top
      // (r = W/2 for a semicircular crown), so the circle's centre is at
      // (cx, top + r):
      //   · the apex is inside;
      //   · a quarter of the width off centre and two pixels down is OUTSIDE a
      //     true semicircle (distance from the centre is > r) and INSIDE a
      //     flattened crown, which is exactly the failure this is for — two
      //     quarter-rounds with a straight top between them;
      //   · the same x, three quarters of the way down the crown, is inside —
      //     which proves the probe is following a shape rather than answering
      //     "no" everywhere.
      const r = box.width / 2;
      const cx = box.left + r;
      const hit = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('.moment-arch');

      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        bottomBorder: parseFloat(s.borderBottomWidth),
        headingTop: Math.round(heading.top),
        springLine: Math.round(box.top + r),
        dismissInside: dismiss ? dismiss.getBoundingClientRect().bottom <= box.bottom + 1 : false,
        apex: hit(cx, box.top + 2),
        flatTop: hit(cx - r / 2, box.top + 2),
        shoulder: hit(cx - r / 2, box.top + r * 0.75),
        boxCorner: hit(box.left + 2, box.top + 2),
        straightSide: hit(box.left + 2, box.top + r + 20),
        viewport: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    // Flush with the floor of the window, and no hairline across it.
    expect(m.bottom, `${label}: the arch does not reach the bottom of the window`).toBeGreaterThanOrEqual(
      m.viewport - 1,
    );
    expect(m.bottomBorder, `${label}: the arch has a visible bottom edge`).toBe(0);
    expect(m.top, `${label}: the arch starts above the top of the window`).toBeGreaterThanOrEqual(0);
    // A TRUE SEMICIRCLE, not two quarter-rounds with a flat top between them.
    expect(m.apex, `${label}: nothing at the apex of the crown`).toBe(true);
    expect(m.flatTop, `${label}: THE CROWN IS FLATTENED — the top is straight a quarter-width off centre`).toBe(false);
    expect(m.shoulder, `${label}: the crown's shoulder is missing`).toBe(true);
    expect(m.boxCorner, `${label}: the bounding box's own corner is painted — the crown is not rounded`).toBe(false);
    expect(m.straightSide, `${label}: the side below the spring line is not straight`).toBe(true);
    // The content sits in the shaft, not up inside the curve.
    expect(m.headingTop, `${label}: the heading is inside the crown`).toBeGreaterThanOrEqual(m.springLine);
    expect(m.dismissInside, `${label}: "Not just now" is outside the arch`).toBe(true);
    // And the whole moment still fits one window.
    expect(m.scrollHeight, `${label}: the moment scrolls`).toBeLessThanOrEqual(m.viewport + 1);
    console.log(
      `  ${label.padEnd(16)} arch ${m.width}×${m.bottom - m.top}  top gap ${m.top}  spring line ${m.springLine}  heading at ${m.headingTop}`,
    );
    return m;
  };

  console.log('\nthe arch, bottom-anchored:');
  await geometry('1440×900');
  for (const height of [800, 700]) {
    await page.setViewportSize({ width: 1440, height });
    await geometry(`1440×${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry('390×844 phone');
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── THE LAYER IS FROZEN ──────────────────────────────────────────────────
  // The whole performance argument in one assertion. `.moment-backdrop__page`
  // fades up once (900ms after a 320ms delay) and everything else in there is
  // turned off outright — so past two seconds there must be nothing running,
  // or the blur is being recomputed for a layer nobody can read.
  await page.waitForTimeout(2000);
  const running = await backdrop.evaluate((root) =>
    [...root.querySelectorAll('*')]
      .flatMap((el) => el.getAnimations())
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
        return `${target?.tagName ?? '?'}.${target?.className ?? '?'}`.slice(0, 80);
      }),
  );
  expect(running, 'something is still animating inside the blurred layer').toEqual([]);

  // Frame intervals over three seconds of the settled moment — printed, not
  // asserted. Headless Chromium rasterises in software, so a 24px Gaussian
  // over the whole window is the worst case this can be measured in and the
  // number is a floor rather than a verdict.
  const frames = await page.evaluate(
    () =>
      new Promise<{ frames: number; median: number; worst: number }>((resolve) => {
        const gaps: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          gaps.push(now - last);
          last = now;
          if (now - start < 3000) requestAnimationFrame(tick);
          else {
            const sorted = [...gaps].sort((a, b) => a - b);
            resolve({
              frames: gaps.length,
              median: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
              worst: Math.round(Math.max(...gaps) * 10) / 10,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(
    `\nthe moment, settled: ${Math.round(frames.frames / 3)} fps · median ${frames.median}ms · worst ${frames.worst}ms` +
      '\n(headless Chromium rasterises in software — see MOMENT_BACKDROP in tokens.ts for the same' +
      '\n measurement on a GPU-backed browser, where it is a flat 60fps.)\n',
  );

  // ── AND UNDER REDUCED MOTION IT IS SIMPLY THERE ──────────────────────────
  // The ground fades up once, and that fade is the only thing on this screen
  // that was added with the background. Under `reduce` it must not run — and
  // the failure to look for is not that it runs anyway, it is the opposite:
  // `.moment-backdrop` turns off every animation inside itself, so a ground
  // whose only way of becoming visible is an animation would be left at
  // `opacity: 0` and the screen would go back to standing on the plain page.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.moment-arch')).toBeVisible({ timeout: 20_000 });
  await expect(backdrop.locator('h1')).toContainText(/Good (morning|afternoon|evening)/, { timeout: 20_000 });
  const stillness = await page.evaluate(() => ({
    ground: getComputedStyle(document.querySelector('.moment-backdrop__page')!).opacity,
    // The whole page this time, not just the backdrop: the breathing dot is in
    // the arch, and "the background is static" is only true if nothing is
    // asking for a frame.
    running: document
      .querySelectorAll('*')
      .length
      ? [...document.querySelectorAll('*')].flatMap((el) => el.getAnimations()).filter((a) => a.playState === 'running')
          .length
      : 0,
  }));
  expect(stillness.ground, 'the ground never became visible under reduced motion').toBe('1');
  expect(stillness.running, 'something is animating under prefers-reduced-motion').toBe(0);

  await ctx.close();
  await adminCtx.close();
});
