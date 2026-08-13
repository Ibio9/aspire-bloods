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
  // ONE button to view them. The dismissal is a link-shaped control beneath the
  // arch and is deliberately not a second button competing with it.
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
