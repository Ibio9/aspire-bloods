import { test, expect } from '@playwright/test';

/**
 * Open registration, end to end: anyone can create an account, the account
 * is inert until the emailed code is entered, and entering it leads straight
 * into mandatory 2FA rather than into a session.
 *
 * The registration form itself is posted through the API rather than the UI —
 * this test is about the flow, not about the fields. Everything from the
 * confirmation code onwards is driven through the real screens.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true in the server's env (see README) so the
 * test can read the confirmation code and OTP straight from API responses
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
  expect(signupBody.devVerificationCode).toMatch(/^\d{6}$/);
  // Minutes, not hours — a six-digit code must not stand for a day.
  expect(signupBody.expiresInMinutes).toBeLessThanOrEqual(30);

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

  // --- Entering the emailed code confirms the address AND starts 2FA ---
  // Driven from /verify-email, which is the way back in for anyone who closed
  // the tab after registering. Asking for a code seconds after signing up hits
  // the server's resend cooldown, so nothing is reissued and the code from
  // registration is still the live one — which is exactly the behaviour worth
  // pinning: the screen advances identically either way, because this endpoint
  // must not reveal whether anything was actually sent.
  await page.goto('/verify-email');
  const [resendResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/verify-email/resend')),
    page
      .getByLabel('Email address')
      .fill(uniqueEmail)
      .then(() => page.getByRole('button', { name: 'Send me a code' }).click()),
  ]);
  expect(resendResponse.status()).toBe(202);

  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  const [verifyResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/auth/verify-email') && !res.url().includes('resend') && res.request().method() === 'POST',
    ),
    // Auto-submits on the sixth digit, exactly like the 2FA step.
    page.locator('#otp-0').click().then(() => page.keyboard.type(signupBody.devVerificationCode)),
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
