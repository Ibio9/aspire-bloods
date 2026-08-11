import { test, expect } from '@playwright/test';

/**
 * The entry path, for someone who has never been here before.
 *
 * Each of these was a real dead end rather than a hypothetical: /signup
 * existed with nothing routing to it, forgotten-password had no route at all,
 * and a deep link followed while signed out landed you on the home page
 * afterwards instead of on the thing you clicked.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true in the server's env (see README) so the
 * specs can read confirmation codes, reset links and OTP codes straight from
 * the API responses instead of an inbox.
 */

async function registerAndVerify(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const email = `e2e-frontdoor-${Date.now()}@example.com`;
  const password = 'E2eFrontDoorPassword123!';

  const signup = await request.post('/api/auth/signup', {
    data: {
      email,
      password,
      profile: {
        firstName: 'Nadia',
        lastName: 'Newcomer',
        dob: '1988-02-11',
        contactNumber: '+44 7700 900321',
      },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: true, commsSms: false },
    },
  });
  expect(signup.ok()).toBeTruthy();
  const code = (await signup.json()).devVerificationCode as string;

  // Verification is a six-digit code, so the way back into an unfinished
  // registration is /verify-email asking for the address — not a link. Asking
  // for a code seconds after registering hits the server's resend cooldown, so
  // nothing is reissued and the code from signup is still the live one.
  await page.goto('/verify-email');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();

  const [verifyResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/auth/verify-email') && !r.url().includes('resend') && r.request().method() === 'POST',
    ),
    page.locator('#otp-0').click().then(() => page.keyboard.type(code)),
  ]);
  const otp = (await verifyResponse.json()).devOtpCode as string;
  await expect(page.getByRole('heading', { name: 'Set up two-factor sign-in' })).toBeVisible();
  await page.locator('#otp-0').click();
  await page.keyboard.type(otp);

  return { email, password };
}

test('the sign-in screen says whose portal this is and routes to registration', async ({ page }) => {
  await page.goto('/login');

  // Someone arriving cold has to be able to tell what this is. The form itself
  // no longer explains what signing in is — whose portal this is is carried by
  // the left panel: the wordmark, the positioning line and the address block.
  await expect(page.getByRole('heading', { name: 'Your results, explained.' })).toBeVisible();
  // The practice's name and its address, as one identity block. "Aspire
  // Clinic, part of the Aspire Group of Companies" is gone: the registered
  // entity name is not what a patient calls this place.
  // \s* not \s+: the two lines are separated by a <br>, which contributes
  // nothing at all to textContent.
  await expect(page.getByText(/Aspire Clinic\s*27 Mortimer Street, London/)).toBeVisible();

  // The route to /signup that used to not exist anywhere in the product.
  const createAccount = page.getByRole('link', { name: 'Create an account' });
  await expect(createAccount).toBeVisible();
  await createAccount.click();
  await expect(page).toHaveURL(/\/signup$/);

  // And back the other way, in the same place on the mirrored screen.
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('the registration and sign-in cross-links are keyboard reachable', async ({ page }) => {
  await page.goto('/login');
  const createAccount = page.getByRole('link', { name: 'Create an account' });
  // It's an anchor, not a button calling navigate() — so it's in the tab
  // order for free, and cmd-click / open-in-new-tab still work.
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/signup$/);
});

test('an unauthenticated visitor at / lands on sign-in, not a blank page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('forgotten password: request a link, spend it, sign in with the new one', async ({ page, request }) => {
  const { email, password } = await registerAndVerify(page, request);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 10000 });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgotten your password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  const [resetResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/password-reset/request')),
    (async () => {
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Email me a reset link' }).click();
    })(),
  ]);
  // Deliberately non-committal copy: the server answers identically for an
  // address it doesn't know, so the screen must not claim an email was sent.
  await expect(page.getByText('has an Aspire Bloods account')).toBeVisible();

  const resetUrl = (await resetResponse.json()).devResetUrl as string;
  expect(resetUrl).toBeTruthy();

  const newPassword = 'E2eResetPassword456!';
  await page.goto(new URL(resetUrl).pathname + new URL(resetUrl).search);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Your password is changed' })).toBeVisible();

  // The link is single-use — replaying it must fail, not silently succeed.
  const replay = await request.post('/api/auth/password-reset/confirm', {
    data: { token: new URL(resetUrl).searchParams.get('token'), password: newPassword },
  });
  expect(replay.status()).toBe(400);

  // The old password is genuinely dead and the new one genuinely works.
  const oldLogin = await request.post('/api/auth/login', { data: { email, password } });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await request.post('/api/auth/login', { data: { email, password: newPassword } });
  expect(newLogin.ok()).toBeTruthy();
  // Resetting never issues a session — the patient still passes 2FA.
  expect((await newLogin.json()).status).toBe('otp_required');
});

test('a deep link followed while signed out returns you to it after signing in', async ({ page, request }) => {
  const { email, password } = await registerAndVerify(page, request);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 10000 });

  // Sign out, then follow a link into a guarded patient route. /results is
  // inside RoleProtectedRoute — the guard that used to forget where you were
  // going, so sign-in dumped you on the home page instead.
  await request.post('/api/auth/logout');
  await page.context().clearCookies();

  await page.goto('/results');
  await expect(page).toHaveURL(/\/login$/);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    (async () => {
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    })(),
  ]);
  const otp = (await loginResponse.json()).devOtpCode as string;
  await page.locator('#otp-0').click();
  await page.keyboard.type(otp);

  await expect(page).toHaveURL(/\/results$/, { timeout: 10000 });
});

test('a test cannot be ordered until biological sex is on file, and the prompt explains why', async ({
  page,
  request,
}) => {
  await registerAndVerify(page, request);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 10000 });

  // Registered without a sex (it's optional there on purpose), so the
  // account page should be asking for it — with a reason, not a nag.
  await page.goto('/account');
  await expect(page.getByText("We don't have your biological sex on file")).toBeVisible();
  await expect(page.getByText(/reference ranges differ for men and women/i)).toBeVisible();

  await page.getByLabel('Female').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Recorded — the ask is replaced by the fact, not repeated.
  await expect(page.getByText('Female')).toBeVisible();
  await expect(page.getByText("We don't have your biological sex on file")).toHaveCount(0);

  // page.request, not the standalone `request` fixture — the latter has its
  // own cookie jar and would be unauthenticated here.
  const stored = await page.request.get('/api/patient/me/biological-sex');
  const body = await stored.json();
  expect(body.sex).toBe('FEMALE');
  // Randox's own id from GET /BiologicalSex/GetBiologicalSex — 2 = Female.
  expect(body.randoxBiologicalSexId).toBe(2);
  expect(body.canOrderTests).toBe(true);
});
