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

/** The pickers are the custom Listbox, not a native select — open, then pick. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
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

      // By marker is the first tab and the default, and it is the marker list.
      await expect(segment(page, 'By marker')).toHaveAttribute('aria-selected', 'true');
      const markerRows = page.locator('a[href^="/markers/"]');
      await expect(markerRows.first()).toBeVisible({ timeout: 10_000 });
      // Every measured card carries a range bar saying where the value sits.
      // (It replaced the sparkline that used to sit at the foot of these
      // cards — see MarkerResultCard.)
      expect(
        await page.getByRole('img', { name: /reference range/ }).count(),
        `${viewport.at}: the marker list must carry range bars`,
      ).toBeGreaterThan(0);

      // By report: the report list.
      await segment(page, 'By report').click();
      await expect(page).toHaveURL(/view=by-report/);
      const reportLinks = page.locator('a[href^="/reports/"]');
      await expect(reportLinks.first()).toBeVisible({ timeout: 10_000 });

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
      await segment(page, 'By marker').click();
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
    await segment(page, 'By marker').focus();
    await page.keyboard.press('ArrowRight');
    await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(segment(page, 'By marker')).toHaveAttribute('aria-selected', 'true');

    await ctx.close();
  });

  test('the three old destinations still land somewhere real', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();

    await page.goto('/my-results');
    await expect(page).toHaveURL(/\/results\?view=by-report$/);
    await expect(segment(page, 'By report')).toHaveAttribute('aria-selected', 'true');

    // By marker is the default now, so its URL is the bare one.
    await page.goto('/markers');
    await expect(page).toHaveURL(/\/results$/);
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

    await page.goto('/results?view=by-report');
    const first = page.locator('a[href^="/reports/"]').first();
    await expect(first).toBeVisible({ timeout: 10_000 });
    const href = await first.getAttribute('href');
    await first.click();

    // The link every emailed summary already points at is still the URL.
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByText('This report at a glance')).toBeVisible();
    // The markers themselves are the presentation — one flat grid of cards,
    // ungrouped, rather than a block of area bars saying it first.
    await expect(page.getByText('Every marker on this report')).toBeVisible();
    // The pickers live behind the disclosure, closed on load — see the panel
    // spec below.
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByLabel('Group by')).toContainText('Ungrouped');
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

  /**
   * The report is one presentation of its markers, arranged two ways.
   *
   * It used to be two: a block of health-area summary bars that opened in
   * place, and then the same markers again underneath, grouped under the same
   * area headings. Grouping is now a control over the one grid, and the counts
   * the bars carried live in the headings. What has to hold is that nothing was
   * lost in the move — the breakdown is still there, the filters still reach
   * inside a group, and switching arrangement keeps everything you narrowed.
   */
  test('grouping sections the same cards, carries the counts, and keeps the filters', async ({ browser }) => {
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

    const cards = page.locator('a[href^="/markers/"]');
    const sections = page.locator('section[aria-labelledby^="area-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Ungrouped is the default: every marker on the report, in one flat grid,
    // with no area headings anywhere. The pickers are behind the disclosure,
    // which is closed on load — see the panel spec below.
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByLabel('Group by')).toContainText('Ungrouped');
    await expect(sections).toHaveCount(0);
    const flat = await cards.count();
    expect(flat, 'the report showed no markers at all').toBeGreaterThan(0);

    // Grouped: the same cards under headings. A marker in four areas appears
    // under all four, so the grouped total can only be >= the flat one.
    await choose(page, 'Group by', 'Health area');
    expect(await sections.count(), 'grouping produced no health-area sections').toBeGreaterThan(1);
    expect(await cards.count()).toBeGreaterThanOrEqual(flat);

    // The per-area breakdown the summary bars used to carry is in the heading,
    // still spelling its counts out in words for anyone who cannot see it.
    const breakdown = sections.first().locator('[role="img"]').first();
    await expect(breakdown).toBeVisible();
    expect(await breakdown.getAttribute('aria-label')).toMatch(/range/i);

    // Sort is a separate control now, and it applies inside every group.
    await choose(page, 'Sort by', 'Name (A–Z)');
    const namesInFirstArea = await sections.first().locator('a[href^="/markers/"] p.eyebrow').allInnerTexts();
    expect(namesInFirstArea.length).toBeGreaterThan(0);
    expect(namesInFirstArea).toEqual([...namesInFirstArea].sort((a, b) => a.localeCompare(b)));

    // The page's search narrows within each group, and a group left with
    // nothing is gone rather than standing there empty.
    await page.getByLabel('Find a marker').fill('zzz-no-such-marker');
    await expect(sections).toHaveCount(0);
    await expect(page.getByText('Nothing matches those filters')).toBeVisible();

    // And none of the three controls resets any of the others.
    await page.getByLabel('Find a marker').fill('');
    await expect(page.getByLabel('Group by')).toContainText('Health area');
    await expect(page.getByLabel('Sort by')).toContainText('Name');
    expect(await sections.count()).toBeGreaterThan(1);

    await choose(page, 'Group by', 'Ungrouped');
    await expect(sections).toHaveCount(0);
    await expect(page.getByLabel('Sort by')).toContainText('Name');

    await ctx.close();
  });

  /**
   * The filters panel is the READER'S, and nothing else touches it.
   *
   * It used to open and close on SCROLL: an IntersectionObserver decided
   * whether the bar was pinned, and the same callback wrote the panel's open
   * state on every crossing. So the disclosure did not reliably toggle — a
   * scroll of one pixel could reopen what had just been shut — and at the top
   * of the page the button was not rendered at all, on the grounds that the
   * panel was open anyway, which left no way to close it.
   *
   * What is pinned here is every way the panel is meant to close, because a
   * disclosure that opens and cannot be shut is the bug this replaced: the
   * button, Escape, a click outside the bar, and a change of arrangement. Plus
   * the two things that must survive the panel being shut — the count badge on
   * the button and the chip row in the bar — because a filter somebody cannot
   * see is how they conclude their results have gone missing.
   */
  test('the filters panel opens and closes only when the reader says so', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();

    const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
      reportId: string;
      markerCount: number;
      patientStatus: string;
    }[];
    const biggest = reports.filter((r) => r.patientStatus === 'RELEASED').sort((a, b) => b.markerCount - a.markerCount)[0];

    const panel = page.locator('#results-control-fold');
    const disclosure = page.getByRole('button', { name: /^Filters/ });
    const search = page.getByLabel('Find a marker');
    const applied = page.getByRole('group', { name: 'Applied filters' });

    /**
     * Where the markers begin, in document coordinates.
     *
     * The panel and not the first card: cards enter on a translate (see
     * Reveal), so a card measured before it has scrolled into view reads a
     * dozen pixels low, which is an entrance animation being reported as a
     * layout shift.
     */
    const gridTop = () =>
      page.evaluate(() => Math.round(document.getElementById('results-panel')!.getBoundingClientRect().top + window.scrollY));

    // Mobile is not the afterthought here — it is where the bar is most of the
    // screen and where an unclosable panel costs the most.
    for (const viewport of [
      { width: 1280, height: 720, at: 'desktop' },
      { width: 375, height: 780, at: 'mobile' },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/reports/${biggest.reportId}`);
      await expect(page.locator('a[href^="/markers/"]').first()).toBeVisible({ timeout: 10_000 });

      // Closed on load, and the disclosure is there to open it — at the top of
      // the page as much as anywhere else.
      await expect(disclosure).toBeVisible();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toHaveCount(0);
      const grid = await gridTop();

      // It toggles. Every time, in both directions.
      for (const _ of [0, 1]) {
        await disclosure.click();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByLabel('Group by')).toBeVisible();
        await disclosure.click();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        await expect(panel).toHaveCount(0);
      }

      // Scrolling does not touch it, in either state. This is the regression:
      // the panel used to be written by the scroll observer.
      await page.evaluate(() => window.scrollTo(0, 1500));
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await page.evaluate(() => window.scrollBy(0, 600));
      await expect(disclosure, `${viewport.at}: scrolling closed the panel`).toHaveAttribute('aria-expanded', 'true');

      // Escape closes it.
      await page.keyboard.press('Escape');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

      // A click outside the bar closes it; a click on the disclosure itself is
      // not an outside click and must not close-then-reopen.
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      // The page title: unambiguously outside the bar, and never under the
      // sticky one — the markers below it are, which is why this is not a
      // click on the grid.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('heading', { level: 1 }).click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

      // The condensed bar still carries the search and the view switch, and
      // nothing about opening or closing the panel moves the markers.
      await expect(search).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Results view' })).toBeVisible();
      expect(await gridTop(), `${viewport.at}: the panel moved the markers`).toBe(grid);

      // A filter set from the panel stays VISIBLE once the panel has gone —
      // as a chip in the bar and as a count on the disclosure itself.
      await disclosure.click();
      await page.getByLabel('Show').click();
      await page.getByRole('option', { name: /^Above range/ }).click();
      await page.keyboard.press('Escape');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(applied.getByRole('button', { name: /Above range/ })).toBeVisible();
      await expect(disclosure).toContainText('1');

      // And clearing from there clears it.
      await applied.getByRole('button', { name: 'Clear all filters' }).click();
      await expect(applied).toHaveCount(0);
      await expect(page.getByText('187 markers')).toBeVisible();

      // Changing arrangement closes the panel — the four pickers mean
      // different things per view, and a panel that survives the switch is
      // showing the last view's controls over this view's results.
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await segment(page, 'By marker').click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

      // Nothing about any of it touches what was typed.
      await search.fill('ferritin');
      await page.evaluate(() => window.scrollTo(0, 0));
      await disclosure.click();
      await expect(search).toHaveValue('ferritin');
      await page.keyboard.press('Escape');
    }

    await ctx.close();
  });

  /**
   * The other two views are reachable from inside a report.
   *
   * They were rendered, they were focusable, they took the click — and nothing
   * happened, because an open report pins the view by its ROUTE and the switch
   * only ever wrote a query parameter. Three tabs, one of them working.
   */
  test('the view switch works from inside an open report', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 1000 });

    await page.goto('/results?view=by-report');
    const firstReport = page.locator('a[href^="/reports/"]').first();
    await expect(firstReport).toBeVisible({ timeout: 10_000 });
    const href = await firstReport.getAttribute('href');
    await firstReport.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    // Leaving the report is a change of PATH, not a change of arrangement, so
    // the filters start clean on the other side — the same as they do on the
    // way in, when a report is opened from the list. Carrying between the three
    // views is the promise, and that is asserted above on /results itself.
    await segment(page, 'By marker').click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(segment(page, 'By marker')).toHaveAttribute('aria-selected', 'true');
    // And it is genuinely the marker list, not a report still on screen.
    await expect(page.locator('a[href^="/markers/"]').first()).toBeVisible({ timeout: 10_000 });

    // Back returns to the report that was open, rather than skipping past it.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    await segment(page, 'Compare').click();
    await expect(page).toHaveURL(/\/results\?view=compare$/);
    await expect(segment(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Choose markers')).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });
});
