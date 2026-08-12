import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The whole publish flow, driven by the REAL Randox HSC5 Basic Screen sample
 * report rather than a two-line synthetic PDF.
 *
 * Two claims are being checked, and neither is checkable any other way:
 *
 *  1. Uploading that document produces a fully-populated, publishable parse in
 *     one request — markers matched, ranges resolved, statuses derived — and
 *     publishing it takes one more. That is the interaction budget the whole
 *     change exists to hit.
 *  2. The state machine survives it. The report passes through PARSED
 *     and CLINICIAN_REVIEWED on the way to RELEASED, and the patient can see
 *     nothing until it gets there.
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
  expect(otp.ok()).toBeTruthy();
}

async function csrfFor(request: APIRequestContext): Promise<string> {
  const cookie = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token');
  return cookie?.value ?? '';
}

test('the real Randox sample uploads, parses and publishes in one step', async ({ browser }) => {
  const patientEmail = `e2e-publish-${Date.now()}@example.com`;
  const patientPassword = 'PublishPassword123!';

  const adminCtx = await browser.newContext();
  const adminRequest = adminCtx.request;
  await loginAndVerify(adminRequest, 'admin@aspireshield.dev', 'DevAdminPass123!');
  const adminCsrf = await csrfFor(adminRequest);

  const invite = await adminRequest.post('/api/auth/invite', {
    data: { email: patientEmail },
    headers: { 'X-CSRF-Token': adminCsrf },
  });
  const inviteBody = await invite.json();
  const inviteToken = new URL(inviteBody.devActivationUrl).searchParams.get('token');

  // Biological sex on file, because the optimal band for several markers on
  // this report is sex-specific and the resolver refuses to guess without it.
  await adminRequest.post('/api/auth/activate', {
    data: {
      inviteToken,
      password: patientPassword,
      profile: {
        firstName: 'Publish',
        lastName: 'Patient',
        sex: 'MALE',
        dob: '1985-05-05',
        contactNumber: '+44 7000 333444',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });
  const patientId = inviteBody.userId;

  const sources = await (await adminRequest.get('/api/panels/sources')).json();
  const source = sources.find((s: { key: string }) => s.key === 'randox_portal') ?? sources[0];

  // --- One request: upload. The parse comes back with it. ---
  const upload = await adminRequest.post('/api/reports', {
    multipart: {
      patientId,
      sourceId: source.id,
      sampleDate: '2026-03-01',
      file: { name: 'hsc5-sample.pdf', mimeType: 'application/pdf', buffer: readFileSync(SAMPLE) },
    },
    headers: { 'X-CSRF-Token': adminCsrf },
  });
  expect(upload.ok()).toBeTruthy();
  const created = await upload.json();

  expect(created.parseError, `auto-parse failed: ${created.parseError}`).toBeFalsy();
  expect(created.parse, 'upload did not return a parse').toBeTruthy();
  expect(created.status).toBe('PARSED');

  const { summary, rows } = created.parse;
  // Every analyte in the "Results for your Doctor" table.
  expect(rows.length).toBeGreaterThanOrEqual(30);
  expect(summary.unmatched, `unmatched: ${rows.filter((r: any) => !r.matchedMarkerId).map((r: any) => r.rawName).join(', ')}`).toBe(0);

  // Every row got a range from one of the two permitted sources, and a status
  // derived from it — with nobody typing a status anywhere.
  for (const row of rows) {
    expect(row.rangeSource, `${row.rawName} has no range`).not.toBeNull();
    expect(['result', 'marker_fallback']).toContain(row.rangeSource);
    expect(row.derivedStatus, `${row.rawName} has no derived status`).not.toBeNull();
  }
  // The range printed on the result is the authority; the marker fallback is
  // only reached where the report printed a one-sided threshold.
  expect(rows.filter((r: any) => r.rangeSource === 'result').length).toBeGreaterThanOrEqual(20);

  expect(summary.needingAttention).toBe(0);
  expect(summary.readyToPublish).toBe(true);

  // --- Patient sees nothing at this point. ---
  const patientCtx = await browser.newContext();
  await loginAndVerify(patientCtx.request, patientEmail, patientPassword);
  expect((await patientCtx.request.get(`/api/patient/reports/${created.id}`)).status()).toBe(404);

  // --- One more request: publish. ---
  const publish = await adminRequest.post(`/api/reports/${created.id}/publish`, {
    data: {
      sampleDate: '2026-03-01T00:00:00.000Z',
      confirm: true,
      results: rows
        .filter((r: any) => r.matchedMarkerId && r.referenceLow != null && r.referenceHigh != null)
        .map((r: any) => ({
          markerId: r.matchedMarkerId,
          value: r.value ?? r.resultText,
          unit: r.unit,
          referenceLow: r.referenceLow,
          referenceHigh: r.referenceHigh,
        })),
    },
    headers: { 'X-CSRF-Token': adminCsrf },
  });
  expect(publish.ok(), await publish.text()).toBeTruthy();

  const afterPublish = await (await adminRequest.get(`/api/reports/${created.id}`)).json();
  expect(afterPublish.status).toBe('RELEASED');
  // Every intermediate state was genuinely passed through, not skipped: both
  // timestamps are set, which only the verify and review transitions write.
  expect(afterPublish.verifiedAt).toBeTruthy();
  expect(afterPublish.reviewedAt).toBeTruthy();
  expect(afterPublish.releasedAt).toBeTruthy();

  // --- The patient can now see it, with both ranges where one exists. ---
  const patientReport = await patientCtx.request.get(`/api/patient/reports/${created.id}`);
  expect(patientReport.ok()).toBeTruthy();
  const detail = await patientReport.json();
  expect(detail.markers.length).toBeGreaterThanOrEqual(30);

  const cholesterol = detail.markers.find((m: any) => m.name === 'Total Cholesterol');
  expect(cholesterol).toBeDefined();
  // 5.85 mmol/l against a desirable ceiling of 5.0: in the lab's range on this
  // report's own printed range, and outside the optimal band. Both facts are
  // reported, separately, and neither overwrites the other.
  expect(cholesterol.referenceLow).not.toBeUndefined();
  expect(cholesterol.optimal, 'total cholesterol should carry an established optimal band').toBeTruthy();
  expect(cholesterol.optimal.high).toBe(5);
  expect(cholesterol.optimal.within).toBe(false);
  expect(cholesterol.optimal.source).toContain('JBS3');

  // A marker with no established optimal carries null, not an empty band.
  const albumin = detail.markers.find((m: any) => m.name === 'Albumin');
  expect(albumin).toBeDefined();
  expect(albumin.optimal).toBeNull();

  // HDL's band is sex-specific and this patient is male.
  const hdl = detail.markers.find((m: any) => m.name === 'HDL Cholesterol');
  expect(hdl.optimal?.low).toBe(1);

  await adminCtx.close();
  await patientCtx.close();
});
