import { test, expect, type APIRequestContext } from '@playwright/test';
import PDFDocument from 'pdfkit';
import { pressThroughWalkthrough } from './walkthrough';

/**
 * The single most safety-critical behaviour in this app (brief §5):
 * nothing is patient-visible until a report reaches RELEASED. This test
 * drives a report through the full state machine and asserts the patient
 * cannot see it — via the UI or the API directly — at every step before
 * release, then confirms it appears the moment it's released.
 */

async function buildTestPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(12).text('Sample Date: 01/03/2026');
    doc.text('Haemoglobin 140 g/L 120-150');
    doc.text('Total Cholesterol 4.2 mmol/L 0.0-5.0');
    doc.end();
  });
}

async function loginAndVerify(request: APIRequestContext, email: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const body = await login.json();
  if (body.status === 'authenticated') return; // trusted-device path, not expected here but harmless
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

async function csrfFor(request: APIRequestContext): Promise<string> {
  const cookie = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token');
  return cookie?.value ?? '';
}

test('nothing patient-visible until a report is RELEASED', async ({ page, browser }) => {
  const patientEmail = `e2e-gate-${Date.now()}@example.com`;
  const patientPassword = 'GatePassword123!';

  // --- Separate API contexts per role so cookies don't clash ---
  const adminCtx = await browser.newContext();
  const adminRequest = adminCtx.request;
  await loginAndVerify(adminRequest, 'admin@aspireshield.dev', 'DevAdminPass123!');
  const adminCsrf = await csrfFor(adminRequest);

  // Invite + activate a fresh patient purely via API (this test is about the release gate, not the registration form)
  const invite = await adminRequest.post('/api/auth/invite', {
    data: { email: patientEmail },
    headers: { 'X-CSRF-Token': adminCsrf },
  });
  const inviteBody = await invite.json();
  const inviteToken = new URL(inviteBody.devActivationUrl).searchParams.get('token');

  await adminRequest.post('/api/auth/activate', {
    data: {
      inviteToken,
      password: patientPassword,
      profile: {
        firstName: 'Gate',
        lastName: 'Patient',
        dob: '1993-03-03',
        contactNumber: '+44 7000 111222',
        address: '1 Gate Street, London',
        postcode: 'E1 6AN',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });

  const patientId = inviteBody.userId;

  const panels = await adminRequest.get('/api/panels');
  const panelList = await panels.json();
  const panel = panelList.find((p: { name: string }) => p.name === 'Signature');

  // sourceId is required by the upload schema and always has been — the spec
  // simply never sent it, so this upload had been failing its expect() before
  // it ever reached the release-gate assertions this test exists for.
  const sources = await adminRequest.get('/api/panels/sources');
  const sourceList = await sources.json();
  const source = sourceList.find((s: { key: string }) => s.key === 'randox_portal') ?? sourceList[0];

  const pdfBuffer = await buildTestPdf();
  const upload = await adminRequest.post('/api/reports', {
    multipart: {
      patientId,
      panelId: panel.id,
      sourceId: source.id,
      sampleDate: '2026-03-01',
      file: { name: 'test-report.pdf', mimeType: 'application/pdf', buffer: pdfBuffer },
    },
    headers: { 'X-CSRF-Token': adminCsrf },
  });
  expect(upload.ok()).toBeTruthy();
  const report = await upload.json();

  await adminRequest.post(`/api/reports/${report.id}/parse`, { headers: { 'X-CSRF-Token': adminCsrf } });

  const haemoglobin = (await (await adminRequest.get('/api/panels/markers')).json()).find(
    (m: { key: string }) => m.key === 'haemoglobin',
  );
  await adminRequest.post(`/api/reports/${report.id}/verify`, {
    data: {
      sampleDate: '2026-03-01T00:00:00.000Z',
      results: [{ markerId: haemoglobin.id, value: 140, unit: 'g/L', referenceLow: 120, referenceHigh: 150 }],
    },
    headers: { 'X-CSRF-Token': adminCsrf },
  });

  // --- Patient logs in via the real UI ---
  const patientCtx = await browser.newContext();
  const patientPage = await patientCtx.newPage();
  await patientPage.goto('/login');
  await patientPage.fill('input[name=email]', patientEmail);
  await patientPage.fill('input[name=password]', patientPassword);
  const [loginResponse] = await Promise.all([
    patientPage.waitForResponse((res) => res.url().includes('/api/auth/login')),
    patientPage.click('button[type=submit]'),
  ]);
  const loginBody = await loginResponse.json();
  // OTP is six auto-advancing single-digit boxes — typing into the first fills the rest, and a
  // completed code auto-submits (see OtpInput's onComplete), so no separate submit click here.
  await patientPage.locator('#otp-0').click();
  await patientPage.keyboard.type(loginBody.devOtpCode);
  // Signing in lands on the portal Overview, not the panel list.
  // FIRST SIGN-IN LANDS ON THE INTRODUCTION, ONCE (Aug 2026). A patient who has
  // never seen it is sent to /welcome from "/", so a spec that signs a NEW
  // account in and then waits for the Overview greeting waits for a screen that
  // is one press away. Pressing through it is what a real first-time patient
  // does, and it also marks it seen — so everything after this behaves exactly
  // as it did before the walkthrough existed.
  await pressThroughWalkthrough(patientPage, /Good (morning|afternoon|evening)/);

  // PARSED, not yet reviewed or released — the Overview says a result is coming
  // and nothing whatever about its contents.
  //
  // THE COPY THIS ASSERTED HAD BEEN GONE FOR SOME TIME. "A result is on its
  // way" is not in the product and is not at HEAD; the sentence a patient with
  // a pending first sample actually reads is the one below, and this line had
  // been failing silently against a string nobody had written since the
  // Overview was restructured. Asserted against the product's own words, and
  // the claim underneath — that nothing about the contents leaks — is
  // unchanged and is the half that matters.
  await expect(patientPage.getByText('Your first sample is with the clinical team')).toBeVisible();
  await expect(patientPage.getByText('in range')).not.toBeVisible();

  // Same on the panel list itself
  // Scoped to the nav: the sidebar wordmark's accessible name ("Aspire
  // Bloods, my results") also matches, sits earlier in the DOM, and links to
  // /overview — .first() was clicking that and never leaving the page.
  // exact: "Understanding your results" also contains the word.
  await patientPage
    .getByRole('navigation', { name: 'Patient portal' })
    .getByRole('link', { name: 'Results', exact: true })
    .click();
  // Results opens on By marker, which is the default view — the pending-report
  // card lives in the report list, so switch to it. (This step was missing and
  // the assertion below had been failing since By marker became the default.)
  await patientPage.getByRole('tab', { name: /By test/ }).click();
  await expect(patientPage.getByText('Your results are with the clinical team')).toBeVisible();
  await expect(patientPage.getByText('in range')).not.toBeVisible();

  // Direct API check too — not just a hidden-in-the-UI check
  const patientReportCheck = await patientCtx.request.get(`/api/patient/reports/${report.id}`);
  expect(patientReportCheck.status()).toBe(404);

  // --- Clinician reviews and releases ---
  const clinicianCtx = await browser.newContext();
  const clinicianRequest = clinicianCtx.request;
  await loginAndVerify(clinicianRequest, 'clinician@aspireshield.dev', 'DevClinicianPass123!');
  const clinicianCsrf = await csrfFor(clinicianRequest);

  const review = await clinicianRequest.post(`/api/reports/${report.id}/review`, {
    data: { approve: true },
    headers: { 'X-CSRF-Token': clinicianCsrf },
  });
  expect(review.ok()).toBeTruthy();

  const release = await clinicianRequest.post(`/api/reports/${report.id}/release`, {
    headers: { 'X-CSRF-Token': clinicianCsrf },
  });
  expect(release.ok()).toBeTruthy();

  // --- Patient now sees it, both via API and the UI ---
  const patientReportAfterRelease = await patientCtx.request.get(`/api/patient/reports/${report.id}`);
  expect(patientReportAfterRelease.ok()).toBeTruthy();

  await patientPage.reload();
  await expect(patientPage.getByText('1 in range')).toBeVisible({ timeout: 10000 });

  await adminCtx.close();
  await patientCtx.close();
  await clinicianCtx.close();
});
