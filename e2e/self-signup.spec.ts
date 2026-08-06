import { test, expect } from '@playwright/test';

/**
 * Open registration, end to end: anyone can create an account, the account
 * is inert until the emailed link is opened, and opening it leads straight
 * into mandatory 2FA rather than into a session.
 *
 * The registration form itself is posted through the API rather than the UI —
 * the date-of-birth field is an on-brand calendar popover, and clicking back
 * to 1985 a month at a time would make this test about the picker rather than
 * about the flow. Everything from the emailed link onwards is driven through
 * the real screens, because that's the part this change introduces.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true in the server's env (see README) so the
 * test can read the confirmation link and OTP straight from API responses
 * instead of an email inbox.
 */
test('self-signup -> email verification -> 2FA -> empty portal', async ({ page, request }) => {
  const uniqueEmail = `e2e-signup-${Date.now()}@example.com`;
  const password = 'E2eSignupPassword123!';

  // --- Anyone can register: no invite, no admin, no approval ---
  const signup = await request.post('/api/auth/signup', {
    data: {
      email: uniqueEmail,
      password,
      profile: {
        firstName: 'Selma',
        lastName: 'Registrant',
        dob: '1985-04-03',
        contactNumber: '+44 7700 900123',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: true, commsSms: false },
    },
  });
  expect(signup.ok()).toBeTruthy();
  const signupBody = await signup.json();
  expect(signupBody.status).toBe('verification_sent');
  // Masked, never the address back in full.
  expect(signupBody.sentTo).not.toBe(uniqueEmail);
  expect(signupBody.devVerificationUrl).toBeTruthy();

  // --- The account exists but is inert until the address is confirmed ---
  const prematureLogin = await request.post('/api/auth/login', { data: { email: uniqueEmail, password } });
  expect(prematureLogin.status()).toBe(403);
  expect((await prematureLogin.json()).error).toMatch(/confirm your email/i);

  // --- An already-registered address must not be distinguishable ---
  const duplicate = await request.post('/api/auth/signup', {
    data: {
      email: uniqueEmail,
      password,
      profile: {
        firstName: 'Someone',
        lastName: 'Else',
        dob: '1990-01-01',
        contactNumber: '+44 7700 900999',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });
  expect(duplicate.ok()).toBeTruthy();
  expect((await duplicate.json()).status).toBe('verification_sent');

  // --- Opening the emailed link confirms the address AND starts 2FA ---
  const verifyToken = new URL(signupBody.devVerificationUrl).searchParams.get('token');
  expect(verifyToken).toBeTruthy();

  const [verifyResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/verify-email') && res.request().method() === 'POST'),
    page.goto(`/verify-email?token=${verifyToken}`),
  ]);
  const verifyBody = await verifyResponse.json();
  expect(verifyBody.status).toBe('otp_required');
  expect(verifyBody.devOtpCode).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Set up two-factor sign-in' })).toBeVisible();
  await page.locator('#otp-0').click();
  await page.keyboard.type(verifyBody.devOtpCode);

  // --- Signed in, on a warm empty portal rather than a blank one ---
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: "What you'll see here" })).toBeVisible();
  await expect(page.getByText('a new account simply starts empty')).toBeVisible();

  await page.goto('/my-results');
  await expect(page.getByText("Nothing here yet — and that's exactly right")).toBeVisible();
  await expect(page.getByText('the clinic matches the result to you')).toBeVisible();
});
