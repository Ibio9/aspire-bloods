import { test, expect } from '@playwright/test';

/**
 * The patient sidebar's job is navigation, and it has to be able to do it.
 *
 * The contact block used to sit permanently expanded at the bottom and took
 * roughly half the column at a normal window height, which pushed the eight
 * nav items into a short scrolling strip that cut rows in half. Both halves of
 * that are pinned here: every item fully visible at 768px, and the contact
 * details one compact row that opens in place and stays how it was left.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true in the server's env (see README).
 */

async function registerAndSignIn(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const email = `e2e-sidebar-${Date.now()}@example.com`;
  const password = 'E2eSidebarPassword123!';

  const signup = await request.post('/api/auth/signup', {
    data: {
      email,
      password,
      profile: { firstName: 'Sasha', lastName: 'Sidebar', dob: '1990-06-06', contactNumber: '+44 7700 900444' },
      consents: { dataProcessing: true, resultsStorage: true, commsEmail: false, commsSms: false },
    },
  });
  expect(signup.ok()).toBeTruthy();
  const code = (await signup.json()).devVerificationCode as string;

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
  await page.locator('#otp-0').click();
  await page.keyboard.type(otp);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 15000 });
}

// One registration for all three checks. Each of these is a layout question
// about the same signed-in sidebar, and registering three times in a row trips
// the signup and OTP rate limiters — which are process-wide on purpose.
test('the patient sidebar gives navigation the room, and keeps contact one row away', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await registerAndSignIn(page, request);

  // --- Every item fully visible at 768px ---
  const nav = page.getByRole('navigation', { name: 'Patient portal' });
  await expect(nav).toBeVisible();

  // Not overflowing at all — the whole point. scrollHeight only exceeds
  // clientHeight once there is something out of view.
  const { scrollHeight, clientHeight } = await nav.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight, 'the nav must not need to scroll at 768px').toBeLessThanOrEqual(clientHeight + 1);

  // And every row is inside the box, not merely in the DOM: a half-clipped
  // item is what this is really guarding against.
  const navBox = (await nav.boundingBox())!;
  const links = await nav.getByRole('link').all();
  expect(links.length).toBe(8);
  for (const link of links) {
    const box = (await link.boundingBox())!;
    const label = (await link.textContent())?.trim().slice(0, 24);
    expect(box.y, `"${label}" is clipped at the top`).toBeGreaterThanOrEqual(navBox.y - 1);
    expect(box.y + box.height, `"${label}" is clipped at the bottom`).toBeLessThanOrEqual(navBox.y + navBox.height + 1);
  }

  // The contact block is one row until asked otherwise.
  const contact = page.getByRole('button', { name: 'Contact the clinic' });
  await expect(contact).toHaveAttribute('aria-expanded', 'false');
  expect((await contact.boundingBox())!.height).toBeLessThan(56);

  // --- It opens in place, and the choice is remembered ---
  await contact.click();
  await expect(contact).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#clinic-contact-details').getByRole('link', { name: /@/ })).toBeVisible();

  // Across a navigation...
  await page.getByRole('navigation', { name: 'Patient portal' }).getByRole('link', { name: /All markers/ }).click();
  await expect(page.locator('#clinic-contact-details')).toBeVisible();

  // ...and across a reload, which is what "persist" has to mean for someone
  // who wants the number in front of them.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Contact the clinic' })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Contact the clinic' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Contact the clinic' })).toHaveAttribute('aria-expanded', 'false');

  // --- A window genuinely too short scrolls to a soft edge, not a cut row ---
  await page.setViewportSize({ width: 1280, height: 560 });
  const shortNav = page.getByRole('navigation', { name: 'Patient portal' });
  const short = await shortNav.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(short.scrollHeight, 'this height is meant to be too short — otherwise the check proves nothing').toBeGreaterThan(
    short.clientHeight,
  );

  // The fade is rendered only while there is more below.
  await expect(page.locator('nav[aria-label="Patient portal"] ~ div[aria-hidden="true"]').first()).toBeAttached();

  // The last item is still reachable, and lands fully inside the box.
  await shortNav.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const shortNavBox = (await shortNav.boundingBox())!;
  const lastBox = (await shortNav.getByRole('link').last().boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(shortNavBox.y + shortNavBox.height + 1);
});
