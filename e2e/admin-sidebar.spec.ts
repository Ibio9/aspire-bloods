import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The admin sidebar's footer used to be an absolutely-positioned collapse
 * button pinned to the bottom of the panel, outside the layout entirely. With
 * seven nav rows and the "My results" crossing link at the end of them, it
 * floated over the last row: text over text at every ordinary window height.
 *
 * This pins what replaced it — the same construction the patient panel uses.
 * A panel exactly one viewport tall, nav that never scrolls inside itself, a
 * footer that is an ordinary flex child sitting on the panel's bottom edge, and
 * no two rows sharing a pixel.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's admin account.
 */

async function signInAsAdmin(page: Page) {
  // page.request, not the top-level `request` fixture: this one shares the
  // page's cookie jar, which is the whole point of signing in over the API.
  const request: APIRequestContext = page.request;
  const login = await request.post('/api/auth/login', {
    data: { email: 'admin@aspireshield.dev', password: process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!' },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  if (body.status !== 'authenticated') {
    const otp = await request.post('/api/auth/otp/verify', {
      data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
    });
    expect(otp.ok()).toBeTruthy();
  }
  // The APIRequestContext and the page share the context's cookie jar.
  await page.goto('/admin');
  await expect(page.getByRole('navigation', { name: 'Clinician console navigation' })).toBeVisible();
}

/** No two interactive rows in the panel overlap, and none is clipped by it. */
async function expectPanelIsSane(page: Page, at: string) {
  const aside = page.locator('aside').first();
  const asideBox = (await aside.boundingBox())!;
  expect(asideBox.y, `the panel starts at the top of the viewport (${at})`).toBeLessThanOrEqual(1);
  expect(asideBox.height, `the panel is a full viewport tall (${at})`).toBeGreaterThanOrEqual(
    (page.viewportSize()?.height ?? 0) - 1,
  );

  const nav = page.getByRole('navigation', { name: 'Clinician console navigation' });
  const { scrollHeight, clientHeight } = await nav.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight, `the nav must never scroll (${at})`).toBeLessThanOrEqual(clientHeight + 1);

  // Every row in the panel — nav links and the footer's own controls — laid
  // end to end with nothing sharing a pixel with anything else. This is the
  // check the old absolutely-positioned collapse button failed.
  const rows = await aside.locator('a, button').all();
  const boxes: { label: string; y: number; bottom: number }[] = [];
  for (const row of rows) {
    const box = await row.boundingBox();
    if (!box || box.height === 0) continue;
    boxes.push({
      label: ((await row.textContent())?.trim() || (await row.getAttribute('aria-label')) || '?').slice(0, 32),
      y: box.y,
      bottom: box.y + box.height,
    });
  }
  boxes.sort((a, b) => a.y - b.y);
  for (let i = 1; i < boxes.length; i += 1) {
    expect(
      boxes[i].y,
      `"${boxes[i - 1].label}" and "${boxes[i].label}" overlap (${at})`,
    ).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
  }

  const last = boxes[boxes.length - 1];
  expect(last.bottom, `"${last.label}" is below the bottom of the panel (${at})`).toBeLessThanOrEqual(
    asideBox.y + asideBox.height + 1,
  );
}

test('the admin sidebar is one viewport tall with nothing overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsAdmin(page);
  await expectPanelIsSane(page, '1440x900');

  // Every destination has its own glyph. Three of them used to share one
  // shield, which is the same as having no icon at all.
  const paths = await page
    .getByRole('navigation', { name: 'Clinician console navigation' })
    .locator('a svg')
    .evaluateAll((svgs) => svgs.map((s) => s.innerHTML));
  expect(new Set(paths).size, 'every nav icon is distinct').toBe(paths.length);

  // The catalogue browsing screen is gone, and nothing in the sidebar points at it.
  await expect(page.getByRole('link', { name: /Randox catalogue/ })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expectPanelIsSane(page, '1280x720');

  // Collapsed, the same panel with the same footer and still nothing overlapping.
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await expectPanelIsSane(page, '1280x720 collapsed');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
});

test('an admin who crosses into the patient portal has a way back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signInAsAdmin(page);

  // The admin account is not a patient of the practice, so it reaches the
  // portal the way anyone would with a URL rather than through "My results".
  await page.goto('/overview');
  const back = page.getByRole('link', { name: 'Back to the admin console' });
  await expect(back).toBeVisible();

  // And it is there on every patient screen, not just the one they landed on.
  await page.goto('/results?view=compare');
  await expect(page.getByRole('link', { name: 'Back to the admin console' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to the admin console' }).click();
  await expect(page.getByRole('navigation', { name: 'Clinician console navigation' })).toBeVisible();
});
