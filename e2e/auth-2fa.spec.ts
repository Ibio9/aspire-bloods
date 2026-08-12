import { test, expect } from '@playwright/test';
import { pressThroughWalkthrough } from './walkthrough';

/**
 * Covers the full patient journey the brief calls out as the thing to
 * "test this hard before anything else": admin invite -> activation
 * (the registration-form fields) -> login -> mandatory 2FA -> an
 * authenticated session landing on the patient dashboard.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true in the server's env (see README) so
 * the test can read the OTP/activation link straight from API responses
 * instead of an email inbox.
 */
test('invite -> activate -> login -> 2FA -> session', async ({ page, request }) => {
  const uniqueEmail = `e2e-auth-${Date.now()}@example.com`;

  // --- Admin logs in and invites a fresh patient ---
  const adminLogin = await request.post('/api/auth/login', {
    data: { email: 'admin@aspireshield.dev', password: 'DevAdminPass123!' },
  });
  expect(adminLogin.ok()).toBeTruthy();
  const adminLoginBody = await adminLogin.json();
  expect(adminLoginBody.devOtpCode).toBeTruthy();

  const adminOtp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: adminLoginBody.challengeId, code: adminLoginBody.devOtpCode, trustDevice: false },
  });
  expect(adminOtp.ok()).toBeTruthy();

  const csrfCookie = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token');
  const invite = await request.post('/api/auth/invite', {
    data: { email: uniqueEmail },
    headers: { 'X-CSRF-Token': csrfCookie?.value ?? '' },
  });
  expect(invite.ok()).toBeTruthy();
  const inviteBody = await invite.json();
  expect(inviteBody.devActivationUrl).toBeTruthy();

  const inviteToken = new URL(inviteBody.devActivationUrl).searchParams.get('token');
  expect(inviteToken).toBeTruthy();

  // --- Patient activates via the actual registration form ---
  //
  // The form is a sequence of steps rather than one long page: stacked, it was
  // half a viewport taller than a 1280x720 laptop, and the auth card is not
  // allowed to scroll inside itself. Same fields, same copy, same single
  // submit at the end — walked here in the order a patient walks it.
  await page.goto(`/activate?token=${inviteToken}`);

  // Step 1 — who you are.
  await page.fill('input[name=firstName]', 'E2E');
  await page.fill('input[name=lastName]', 'Tester');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — how the clinic reaches you and confirms a result is yours.
  // DateField is a custom control: its `name` sits on a hidden input, and
  // the visible field wants DD/MM/YYYY typed — fill by label, not by name.
  await page.getByLabel('Date of birth').fill('02/02/1992');
  await page.fill('input[name=contactNumber]', '+44 7000 000000');
  await page.fill('input[name=address]', '1 Test Street, London');
  await page.fill('input[name=postcode]', 'E1 6AN');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Steps 3 and 4 — GP details and emergency contact, both entirely optional.
  await expect(page.getByText('GP & medical details')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Emergency contact')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 5 — password.
  await page.fill('input[name=password]', 'E2eTestPassword123!');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 6 — consent, and the only submit in the whole form.
  await page.getByRole('checkbox', { name: /consent to Aspire Clinic processing/i }).check();
  await page.getByRole('checkbox', { name: /results being stored securely/i }).check();
  await page.click('button[type=submit]');
  await expect(page.getByText('Your account is active')).toBeVisible({ timeout: 10000 });

  // --- Login with the new credentials, mandatory 2FA ---
  await page.goto('/login');
  await page.fill('input[name=email]', uniqueEmail);
  await page.fill('input[name=password]', 'E2eTestPassword123!');

  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
    page.click('button[type=submit]'),
  ]);
  const loginBody = await loginResponse.json();
  expect(loginBody.status).toBe('otp_required');
  expect(loginBody.devOtpCode).toBeTruthy();

  await expect(page.getByText("We’ve sent a 6-digit verification code")).toBeVisible();
  // OTP is six auto-advancing single-digit boxes rather than one field — typing into the first
  // one fills the rest via the same auto-advance a real user gets, and completing the code
  // auto-submits (see OtpInput's onComplete), so there's no separate submit click here.
  await page.locator('#otp-0').click();
  await page.keyboard.type(loginBody.devOtpCode);

  // --- Lands on the portal Overview, freshly activated with no results yet ---
  // FIRST SIGN-IN LANDS ON THE INTRODUCTION, ONCE (Aug 2026). A patient who has
  // never seen it is sent to /welcome from "/", so a spec that signs a NEW
  // account in and then waits for the Overview greeting waits for a screen that
  // is one press away. Pressing through it is what a real first-time patient
  // does, and it also marks it seen — so everything after this behaves exactly
  // as it did before the walkthrough existed.
  await pressThroughWalkthrough(page, /Good (morning|afternoon|evening)/);
  // A brand-new patient is told what is happening and what happens next, not
  // given a tour of the sidebar.
  await expect(page.getByRole('heading', { name: 'What happens next' })).toBeVisible();
  await expect(page.getByText('Once you have had a sample taken')).toBeVisible();
});
