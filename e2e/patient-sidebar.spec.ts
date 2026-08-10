import { test, expect } from '@playwright/test';

/**
 * The patient sidebar's job is navigation, and it has to be able to do it.
 *
 * The contact block used to sit permanently expanded at the bottom and took
 * roughly half the column at a normal window height, which pushed the whole
 * nav into a short scrolling strip that cut rows in half. Trimming the
 * contact block back to one row bought the space; the nav then kept a scroll
 * container of its own, which put a scrollbar down the side of the panel and
 * still clipped rows once the window dipped under ~750px.
 *
 * So the nav has no scroll container at all now, and this pins what replaced
 * it: a panel exactly one viewport tall with the footer flush to its bottom,
 * every nav item whole at 700px, and — when a window is genuinely shorter
 * than the sidebar's content — the whole column scrolling as one piece rather
 * than the nav scrolling inside a fixed box.
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
/** Every nav row whole, and none of them inside a scroll container. */
async function expectNavFitsWhole(page: import('@playwright/test').Page, at: string) {
  const nav = page.getByRole('navigation', { name: 'Patient portal' });
  await expect(nav).toBeVisible();

  // The nav owns no scrollbar of its own at any height. scrollHeight only
  // exceeds clientHeight once there is something out of view.
  const { scrollHeight, clientHeight } = await nav.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight, `the nav must never scroll (${at})`).toBeLessThanOrEqual(clientHeight + 1);

  // And every row is inside the box, not merely in the DOM: a half-clipped
  // item is what this is really guarding against.
  const navBox = (await nav.boundingBox())!;
  const links = await nav.getByRole('link').all();
  // Five. My results, All markers and Trends were three answers to overlapping
  // questions and are now one Results destination with the three as views
  // inside it; Book a test went with booking, which the clinic's main website
  // handles now (VITE_BOOKING_ENABLED).
  expect(links.length).toBe(5);
  for (const link of links) {
    const box = (await link.boundingBox())!;
    const label = (await link.textContent())?.trim().slice(0, 24);
    expect(box.y, `"${label}" is clipped at the top (${at})`).toBeGreaterThanOrEqual(navBox.y - 1);
    expect(box.y + box.height, `"${label}" is clipped at the bottom (${at})`).toBeLessThanOrEqual(
      navBox.y + navBox.height + 1,
    );
  }
}

test('the patient sidebar gives navigation the room, and keeps contact one row away', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await registerAndSignIn(page, request);

  // --- The panel's background reaches the bottom of the window, at the top of
  // the page and again at the bottom of it ---
  //
  // The disclaimer footer used to render as a sibling of the shell rather than
  // inside it, and the shell is the box this panel is sticky within. A sticky
  // element cannot outlast its containing block, so scrolling to the bottom of
  // a page left the panel ending a footer's height above the window edge with
  // page cream below it — and every page carried exactly that much scroll
  // whether or not it had anything to scroll to.
  {
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('aside')!.getBoundingClientRect();
      const footer = document.querySelector('footer')!.getBoundingClientRect();
      return {
        panelBottom: Math.round(panel.bottom),
        footerBottom: Math.round(footer.bottom + window.scrollY),
        docHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      };
    });
    expect(geometry.panelBottom, 'the panel reaches the bottom of the window').toBeGreaterThanOrEqual(
      geometry.viewport - 1,
    );
    // The footer is the last thing on the page, so its bottom edge *is* the
    // bottom of the document: no band of page cream underneath it, and no
    // scroll that leads nowhere.
    expect(geometry.footerBottom, 'nothing is rendered below the footer').toBe(geometry.docHeight);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const afterScroll = await page.evaluate(() => {
      const panel = document.querySelector('aside')!.getBoundingClientRect();
      return { top: Math.round(panel.top), bottom: Math.round(panel.bottom) };
    });
    expect(afterScroll.top, 'and still starts at the top once scrolled').toBeLessThanOrEqual(0);
    expect(afterScroll.bottom, 'and still reaches the bottom once scrolled').toBeGreaterThanOrEqual(
      geometry.viewport - 1,
    );
  }

  // --- The panel is one viewport tall, with the footer flush to its bottom ---
  const aside = page.locator('aside').first();
  const asideBox = (await aside.boundingBox())!;
  expect(asideBox.y, 'the panel starts at the top of the viewport').toBeLessThanOrEqual(1);
  expect(asideBox.height, 'the panel is a full viewport tall').toBeGreaterThanOrEqual(767);

  const contactRow = page.getByRole('button', { name: 'Contact the clinic' });
  const signOut = page.getByRole('button', { name: 'Sign out' });
  const signOutBox = (await signOut.boundingBox())!;
  expect(
    asideBox.y + asideBox.height - (signOutBox.y + signOutBox.height),
    'the account row sits at the bottom of the panel, not partway down it',
  ).toBeLessThan(24);
  expect((await contactRow.boundingBox())!.y, 'contact sits above the account row').toBeLessThan(signOutBox.y);

  // --- Every item fully visible at 768px, and again at a short-laptop 700px ---
  await expectNavFitsWhole(page, '768px');
  await page.setViewportSize({ width: 1280, height: 700 });
  await expectNavFitsWhole(page, '700px');
  await page.setViewportSize({ width: 1280, height: 768 });

  // The contact block is one row until asked otherwise.
  const contact = page.getByRole('button', { name: 'Contact the clinic' });
  await expect(contact).toHaveAttribute('aria-expanded', 'false');
  expect((await contact.boundingBox())!.height).toBeLessThan(56);

  // --- It opens in place, and the choice is remembered ---
  await contact.click();
  await expect(contact).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#clinic-contact-details').getByRole('link', { name: /@/ })).toBeVisible();

  // Across a navigation...
  await page.getByRole('navigation', { name: 'Patient portal' }).getByRole('link', { name: /Results/ }).click();
  await expect(page.locator('#clinic-contact-details')).toBeVisible();

  // ...and across a reload, which is what "persist" has to mean for someone
  // who wants the number in front of them.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Contact the clinic' })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Contact the clinic' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Contact the clinic' })).toHaveAttribute('aria-expanded', 'false');

  // --- A window genuinely too short scrolls the column, never the nav ---
  //
  // 380px, not 460px, and before that not 560px. The number is a property of
  // the panel's own content height, so it moves every time that does: first
  // when six of the eight rows lost their sublabel, and now again because My
  // results, All markers and Trends became one Results row. Whenever this
  // stops being "too short" the assertion below says so rather than passing
  // while proving nothing.
  await page.setViewportSize({ width: 1280, height: 380 });

  // The nav is still not a scrolling box and still has no clipped rows — the
  // difference at this height is only that the panel as a whole outgrows the
  // viewport, so the column above the nav takes the scroll instead.
  await expectNavFitsWhole(page, '460px');

  const column = page.locator('aside').first().locator('> div').first();
  const short = await column.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(short.scrollHeight, 'this height is meant to be too short — otherwise the check proves nothing').toBeGreaterThan(
    short.clientHeight,
  );

  // Nothing is stranded: scrolling the column brings the last row, and the
  // account footer under it, back inside the panel.
  await column.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const panelBox = (await page.locator('aside').first().boundingBox())!;
  const lastBox = (await page.getByRole('navigation', { name: 'Patient portal' }).getByRole('link').last().boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
