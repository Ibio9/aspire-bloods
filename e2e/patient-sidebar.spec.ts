import { test, expect } from '@playwright/test';

/**
 * The patient sidebar's job is navigation, and it has to be able to do it —
 * without ever taking the patient's own name off the bottom of the window.
 *
 * WHAT CHANGED, AND WHY THE ASSERTIONS DID. The whole column used to be one
 * `overflow-y-auto` box. On a short window with the contact card open, that
 * column grew a scrollbar and the account row — the name, and the way out of
 * the product — went below the fold. A thing you have to scroll a navigation
 * panel to reach is not pinned to the bottom of it.
 *
 * So the giving is now done in a fixed order, by the band that should give:
 *
 *   account row      never. shrink-0, in a band that is never squeezed.
 *   nav rows         only after the contact card has given everything it can.
 *   contact details  first, and internally, inside their own border.
 *
 * The footer band is capped at 45% of the panel, which is the largest cap that
 * still leaves every nav row standing at 700px with the card open — see the
 * note in components/nav/PatientShell.tsx. This file measures that promise at
 * 900, 800 and 700px, open and shut, because "is the sign-out button on
 * screen" is a fact you measure rather than something you notice.
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
  // `level: 2`, and the reason is a strict-mode flake this used to have.
  // The auth split panel carries an h1 "Confirm your email." and the card
  // an h2 "Confirm your email", so the name alone matches BOTH whenever the
  // panel is in the accessibility tree — which depends on the viewport width
  // the previous test happened to leave behind. The card's heading is the one
  // this is waiting for. Same fix as self-signup.spec.ts already has.
  await expect(page.getByRole('heading', { level: 2, name: 'Confirm your email' })).toBeVisible();

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
/**
 * Every nav row whole and inside the box.
 *
 * The nav MAY own a scrollbar now — it is the last thing to give, after the
 * contact card has scrolled internally — but it must not be USING one at an
 * ordinary window height, and a row must never be cut through the middle,
 * which is what a reader sees as a bug.
 */
async function expectNavFitsWhole(page: import('@playwright/test').Page, at: string) {
  const nav = page.getByRole('navigation', { name: 'Patient portal' });
  await expect(nav).toBeVisible();

  const { scrollHeight, clientHeight } = await nav.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight, `the nav should not need to scroll here (${at})`).toBeLessThanOrEqual(clientHeight + 1);

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

  // --- THE ACCOUNT ROW IS ON SCREEN AT EVERY HEIGHT, OPEN OR SHUT ---
  //
  // The failure this replaces: expanding the contact panel pushed the name and
  // Sign out off the bottom of the window. Six measurements, because the two
  // states behave differently and the interesting one is the taller one.
  for (const height of [900, 800, 700]) {
    for (const open of [false, true]) {
      await page.setViewportSize({ width: 1280, height });
      const disclosure = page.getByRole('button', { name: 'Contact the clinic' });
      const isOpen = (await disclosure.getAttribute('aria-expanded')) === 'true';
      if (isOpen !== open) await disclosure.click();
      await page.waitForTimeout(250);

      const at = `${height}px, contact ${open ? 'open' : 'shut'}`;
      const signOutRow = page.getByRole('button', { name: 'Sign out' });
      const box = (await signOutRow.boundingBox())!;
      expect(box.y + box.height, `the account row is inside the window (${at})`).toBeLessThanOrEqual(height + 1);
      expect(box.y, `the account row is not above the window (${at})`).toBeGreaterThanOrEqual(0);

      // The column itself never scrolls — that is what put the row out of
      // reach. If something has to give it is the contact card, inside its own
      // border, and then the nav.
      const column = page.locator('aside').first().locator('> div').first();
      const columnScroll = await column.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(columnScroll.scrollHeight, `the sidebar column must not scroll (${at})`).toBeLessThanOrEqual(
        columnScroll.clientHeight + 1,
      );

      // Every destination still readable and whole.
      await expectNavFitsWhole(page, at);
    }
  }

  // --- A window genuinely too short: the CARD gives, and nothing else ---
  await page.setViewportSize({ width: 1280, height: 520 });
  const disclosure = page.getByRole('button', { name: 'Contact the clinic' });
  if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
  await page.waitForTimeout(250);

  const details = page.locator('#clinic-contact-details');
  const detailScroll = await details.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(
    detailScroll.scrollHeight,
    'this height is meant to be too short for the open card — otherwise the check proves nothing',
  ).toBeGreaterThan(detailScroll.clientHeight);

  // And the row is still there, which is the whole point.
  const finalBox = (await page.getByRole('button', { name: 'Sign out' }).boundingBox())!;
  expect(finalBox.y + finalBox.height).toBeLessThanOrEqual(521);
});

/**
 * The name is a SECOND ROUTE into Account & privacy, beside the nav item.
 *
 * A patient looking for their own details reaches for their own name, and the
 * row previously looked interactive and did nothing. Sign out is a SIBLING of
 * that link and not a child of it: a button inside an anchor is invalid markup
 * and gives one control two behaviours, so a stray click signs someone out
 * when they meant to open their account.
 */
test('the profile row opens Account and privacy, and Sign out stays separate', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await registerAndSignIn(page, request);

  const aside = page.locator('aside').first();
  const profileLink = aside.locator('a[href="/account"]').last();
  await expect(profileLink).toBeVisible();

  // Not nested. The sign-out button must not be inside the link.
  const nested = await page.evaluate(() => {
    const button = [...document.querySelectorAll('aside button')].find((b) => b.textContent?.trim() === 'Sign out');
    return Boolean(button?.closest('a'));
  });
  expect(nested, 'Sign out must be a sibling of the profile link, never a child').toBe(false);

  // It reads as interactive.
  const before = await profileLink.evaluate((el) => getComputedStyle(el).backgroundColor);
  await profileLink.hover();
  await page.waitForTimeout(300);
  const after = await profileLink.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(after, 'the profile row needs a hover state').not.toBe(before);

  // And both routes land on the same page, with no redirect chain.
  await profileLink.click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/overview');
  await page.getByRole('navigation', { name: 'Patient portal' }).getByRole('link', { name: /Account/ }).click();
  await expect(page).toHaveURL(/\/account$/);
});
