import { test, expect } from '@playwright/test';

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
  await page.goto(`/activate?token=${inviteToken}`);
  await page.fill('input[name=firstName]', 'E2E');
  await page.fill('input[name=lastName]', 'Tester');
  await page.fill('input[name=dob]', '1992-02-02');
  await page.fill('input[name=contactNumber]', '+44 7000 000000');
  await page.fill('input[name=address]', '1 Test Street, London');
  await page.fill('input[name=postcode]', 'E1 6AN');
  await page.fill('input[name=password]', 'E2eTestPassword123!');
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

  await expect(page.getByText("We've sent a 6-digit verification code")).toBeVisible();
  await page.fill('input[name=code]', loginBody.devOtpCode);
  await page.click('button[type=submit]');

  // --- Lands on the patient dashboard, freshly activated with no results yet ---
  await expect(page.getByText('Your results')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("haven't had any tests yet")).toBeVisible();
});
