import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The consolidated Results page: three views of one set of data, one search and
 * one pair of filters above them, and the old three destinations still landing
 * somewhere real.
 *
 * The things worth pinning are the ones a refactor of this size quietly breaks:
 * a filter that does not survive a view switch, a bookmark that 404s, a marker
 * that stops opening its own page, and a segmented control that is a set of
 * divs to anything that is not a mouse.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function loginAsDemoPatient(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'demo patient could not complete 2FA').toBeTruthy();
}

function segment(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: false });
}

test.describe('Results', () => {
  test('three views, one set of filters, at desktop and at mobile width', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();

    for (const viewport of [
      { width: 1280, height: 900, at: 'desktop' },
      { width: 375, height: 780, at: 'mobile' },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/results');

      // By report is the default, and it is the report list.
      await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');
      const reportLinks = page.locator('a[href^="/reports/"]');
      await expect(reportLinks.first()).toBeVisible({ timeout: 10_000 });

      // By marker: one row per marker, each with its own sparkline.
      await segment(page, 'By marker').click();
      await expect(page).toHaveURL(/view=by-marker/);
      const markerRows = page.locator('a[href^="/markers/"]');
      await expect(markerRows.first()).toBeVisible({ timeout: 10_000 });
      expect(
        await page.locator('svg[role="img"][aria-label*="result"]').count(),
        `${viewport.at}: the marker list must carry sparklines`,
      ).toBeGreaterThan(0);

      // A search typed here survives the move to Compare — the whole point of
      // hoisting the filters above the switch.
      await page.getByLabel('Find a marker').fill('ferritin');
      await page.waitForTimeout(300);
      await segment(page, 'Compare').click();
      await expect(page).toHaveURL(/view=compare/);
      await expect(page.getByLabel('Find a marker')).toHaveValue('ferritin');
      // And it is narrowing the compare picker, not merely sitting in the box.
      await expect(page.getByText('Choose markers')).toBeVisible({ timeout: 10_000 });
      const labels = await page
        .locator('input[type="checkbox"]')
        .evaluateAll((els) => els.map((el) => el.closest('label')?.textContent ?? ''));
      expect(labels.length, `${viewport.at}: compare offered nothing for "ferritin"`).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.toLowerCase(), `${viewport.at}: "${label}" does not match the carried search`).toContain('ferritin');
      }

      // And back again, still carried.
      await segment(page, 'By report').click();
      await expect(page.getByLabel('Find a marker')).toHaveValue('ferritin');
    }

    await ctx.close();
  });

  test('the segmented control is operable from the keyboard', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/results');

    const strip = page.getByRole('tablist', { name: 'Results view' });
    await expect(strip).toBeVisible();

    // Roving tabindex: one stop for the whole strip, arrows between the three.
    await segment(page, 'By report').focus();
    await page.keyboard.press('ArrowRight');
    await expect(segment(page, 'By marker')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');

    await ctx.close();
  });

  test('the three old destinations still land somewhere real', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();

    await page.goto('/my-results');
    await expect(page).toHaveURL(/\/results$/);
    await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');

    await page.goto('/markers');
    await expect(page).toHaveURL(/\/results\?view=by-marker$/);
    await expect(segment(page, 'By marker')).toHaveAttribute('aria-selected', 'true');

    // A saved comparison keeps its selection across the move, which is the
    // whole reason the redirect carries the query string.
    const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
      markerId: string;
      resultCount: number;
      resultType?: string;
    }[];
    const pair = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount > 1).slice(0, 2);
    await page.goto(`/trends?markers=${pair.map((m) => m.markerId).join(',')}`);
    await expect(page).toHaveURL(/\/results\?.*view=compare/);
    await expect(page).toHaveURL(new RegExp(`markers=${pair[0].markerId}`));
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Compared over time')).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });

  /**
   * Choosing a marker to compare must not throw you out of Compare.
   *
   * The selection and the view now share one query string, and writing the
   * selection used to replace the whole of it — so ticking the first marker
   * dropped `view=compare`, the page fell back to the report list, and the
   * picker vanished under the click that was using it. Invisible while Compare
   * was its own route at /trends; a dead end the moment it became a view.
   */
  test('picking a marker to compare keeps you in Compare', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 1000 });

    await page.goto('/results?view=compare');
    await expect(page.getByText('Choose markers')).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="checkbox"]').first().click({ force: true });
    await expect(page).toHaveURL(/view=compare/);
    await expect(page).toHaveURL(/markers=/);
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    // Still the picker, with the tick still in it, rather than the report list.
    await expect(page.getByText('Choose markers')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(1);

    // And unticking the last one leaves the view where it was, empty picker
    // and all — the selection going away is not a reason to change screens.
    await page.locator('input[type="checkbox"]:checked').first().click({ force: true });
    await expect(page).toHaveURL(/view=compare/);
    await expect(page).not.toHaveURL(/markers=/);
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');

    await ctx.close();
  });

  test('a report opens on its own URL and a marker still gets its own page', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/results');
    const first = page.locator('a[href^="/reports/"]').first();
    await expect(first).toBeVisible({ timeout: 10_000 });
    const href = await first.getAttribute('href');
    await first.click();

    // The link every emailed summary already points at is still the URL.
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByText('This report at a glance')).toBeVisible();
    await expect(page.getByText('By health area')).toBeVisible();
    // Still inside Results rather than off on a page of its own.
    await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');

    // Marker detail is emphatically NOT folded into the list: it stays its own
    // route, with the explanation and the full trend chart on it.
    await page.locator('a[href^="/markers/"]').first().click();
    await expect(page).toHaveURL(/\/markers\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Trend over time')).toBeVisible();
    await expect(page.getByText('What this marker means')).toBeVisible();

    await ctx.close();
  });

  test('a health area opens in place, several at once, and respects the filters', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 1000 });

    const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
      reportId: string;
      markerCount: number;
      patientStatus: string;
    }[];
    const biggest = reports.filter((r) => r.patientStatus === 'RELEASED').sort((a, b) => b.markerCount - a.markerCount)[0];
    await page.goto(`/reports/${biggest.reportId}`);
    await expect(page.getByText('By health area')).toBeVisible();

    const areas = page.locator('p:has-text("By health area") + ul li > button');
    const first = areas.first();
    const second = areas.nth(1);
    const panel = page.locator(`#${await first.getAttribute('aria-controls')}`);

    // Closed means closed: not merely zero-height, but out of the tab order
    // and out of the accessibility tree.
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(await panel.evaluate((el) => (el as HTMLElement).hidden)).toBe(true);

    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('a[href^="/markers/"]').first()).toBeVisible();

    // More than one at a time — comparing two areas is the obvious next thing.
    await second.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'true');

    // The page's search reaches inside an open area.
    await page.getByLabel('Find a marker').fill('zzz-no-such-marker');
    await expect(panel.getByText('Nothing in this area matches the filters above.')).toBeVisible();

    await ctx.close();
  });
});
