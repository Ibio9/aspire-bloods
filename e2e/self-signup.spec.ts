import { test, expect } from '@playwright/test';
import { pressThroughWalkthrough } from './walkthrough';

/**
 * Open registration, end to end: anyone can create an account, the account is
 * inert until the emailed code is entered, and entering that ONE code is what
 * signs them in. Two-factor sign-in is unchanged and mandatory from the next
 * sign-in onwards, which the second test here is what holds.
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

  // Level-scoped: the auth split layout renders a display h1 ("Confirm your
  // email.") beside the form's h2, and an unscoped name matches both.
  await expect(page.getByRole('heading', { level: 2, name: 'Confirm your email' })).toBeVisible();
  const [verifyResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/auth/verify-email') && !res.url().includes('resend') && res.request().method() === 'POST',
    ),
    // Auto-submits on the sixth digit, exactly like the 2FA step.
    page.locator('#otp-0').click().then(() => page.keyboard.type(signupBody.devVerificationCode)),
  ]);
  // ONE CODE, ONCE (Aug 2026), and this is the assertion that pins it.
  //
  // This step used to answer `otp_required` and hand back a SECOND six-digit
  // code, which the patient then read out of a second email and typed into a
  // screen that looked identical to the one they had just used. Both are
  // one-time codes to the same mailbox and the second proved nothing the first
  // had not, so it read as one step repeating itself. Verifying the address is
  // the sign-in now.
  //
  // What this must NOT become is a relaxation of two-factor sign-in, and the
  // test below ("signing in again asks for a 2FA code") is what holds that.
  const verifyBody = await verifyResponse.json();
  expect(verifyBody.status).toBe('authenticated');
  expect(verifyBody.devOtpCode, 'no second code should be issued at registration').toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Set up two-factor sign-in' })).toHaveCount(0);

  // --- Signed in, on a warm empty portal rather than a blank one ---
  // FIRST SIGN-IN LANDS ON THE INTRODUCTION, ONCE (Aug 2026). A patient who has
  // never seen it is sent to /welcome from "/", so a spec that signs a NEW
  // account in and then waits for the Overview greeting waits for a screen that
  // is one press away. Pressing through it is what a real first-time patient
  // does, and it also marks it seen — so everything after this behaves exactly
  // as it did before the walkthrough existed.
  await pressThroughWalkthrough(page, /Good (morning|afternoon|evening)/);
  await expect(page.getByRole('heading', { name: 'What happens next' })).toBeVisible();
  await expect(page.getByText('A new account starts empty')).toBeVisible();

  // The old destination still lands somewhere real — it redirects into the
  // consolidated Results page rather than 404ing on a bookmark.
  await page.goto('/my-results');
  // /my-results was the REPORT LIST, so it redirects to the by-test view
  // rather than to the bare /results (which is By marker, the default —
  // see LegacyResultsRedirect and the note in CLAUDE.md). This assertion
  // had been written against the bare URL and was failing accordingly.
  await expect(page).toHaveURL(/\/results\?view=by-test$/);
  await expect(page.getByText("Nothing here yet, and that’s exactly right")).toBeVisible();
  await expect(page.getByText('the clinic matches the result to you')).toBeVisible();
});

/**
 * THE SECOND HALF OF "ONE CODE, ONCE", AND THE MORE IMPORTANT HALF.
 *
 * Registration stopped asking for a second code because the first one proved
 * the same thing. What must not have quietly happened alongside it is
 * two-factor sign-in becoming optional — so this registers an account, signs
 * out, and signs in again through the real screens. The second sign-in must
 * meet the OTP challenge.
 */
test('signing in again asks for a 2FA code, which registration no longer duplicates', async ({ page, request }) => {
  const email = `e2e-2fa-again-${Date.now()}@example.com`;
  const password = 'E2eSecondSignIn123!';

  const signup = await request.post('/api/auth/signup', {
    data: {
      email,
      password,
      profile: { firstName: 'Robin', lastName: 'Return', dob: '1988-02-02', contactNumber: '+44 7700 900555' },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });
  expect(signup.ok()).toBeTruthy();
  const code = (await signup.json()).devVerificationCode as string;

  // One code, and it is the whole of registration.
  const verified = await request.post('/api/auth/verify-email', { data: { email, code } });
  expect(verified.ok()).toBeTruthy();
  expect((await verified.json()).status).toBe('authenticated');

  // Signing in again is unchanged: password, then a code.
  const login = await request.post('/api/auth/login', { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const loginBody = await login.json();
  expect(loginBody.status, 'the second sign-in must still be challenged').toBe('otp_required');
  expect(loginBody.devOtpCode).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  const body = await loginResponse.json();
  expect(body.status).toBe('otp_required');
  await expect(page.getByRole('heading', { level: 2, name: 'Verify it’s you' })).toBeVisible();
  await page.locator('#otp-0').click();
  await page.keyboard.type(body.devOtpCode);
  await pressThroughWalkthrough(page, /Good (morning|afternoon|evening)/);
});
