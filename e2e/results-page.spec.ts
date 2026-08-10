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
    // The markers themselves are the presentation — one flat grid of cards,
    // ungrouped, rather than a block of area bars saying it first.
    await expect(page.getByText('Every marker on this report')).toBeVisible();
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
    // with no area headings anywhere.
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
   * The control bar condenses once you have scrolled past it — and the page
   * underneath does not pay for it.
   *
   * Two full rows of controls pinned to the top of a window is a third of a
   * 720px screen, and it was taking the names off the cards immediately under
   * it. The bar is now one row from the moment it pins, with the rest folded
   * behind a disclosure.
   *
   * WHAT IS ACTUALLY BEING PINNED HERE is the arithmetic, because that is the
   * part that is easy to get wrong and impossible to see in a screenshot. The
   * bar is sticky, so its box is what the markers start after; anything that
   * changes that box while the bar is pinned drags the whole page up or down
   * under someone mid-read. So the marker grid's position in the DOCUMENT is
   * measured before condensing, after condensing, and after unfolding, and it
   * has to be the same number all three times.
   */
  test('the control bar condenses on scroll without moving anything under it', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();

    const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
      reportId: string;
      markerCount: number;
      patientStatus: string;
    }[];
    const biggest = reports.filter((r) => r.patientStatus === 'RELEASED').sort((a, b) => b.markerCount - a.markerCount)[0];

    const fold = page.locator('#results-control-fold');
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
    /** What the bar actually PAINTS — its one row, once the rest has folded. */
    const paintedHeight = () =>
      page.evaluate(() =>
        Math.round(document.querySelector('input[name="results-search"]')!.closest('div.border-y')!.getBoundingClientRect().height),
      );
    /** Its whole box, painted or not. */
    const boxHeight = () =>
      page.evaluate(() =>
        Math.round(
          document.querySelector('input[name="results-search"]')!.closest('div.border-y')!.parentElement!.getBoundingClientRect()
            .height,
        ),
      );

    // Mobile is not the afterthought here — it is where the walk back to the
    // top of a 187-marker report costs the most, and where the unfolded bar is
    // most of the screen.
    for (const viewport of [
      { width: 1280, height: 720, at: 'desktop' },
      { width: 375, height: 780, at: 'mobile' },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/reports/${biggest.reportId}`);
      await expect(page.locator('a[href^="/markers/"]').first()).toBeVisible({ timeout: 10_000 });

      // At the top: full height, everything on show, and nothing offering to
      // unfold what is already unfolded.
      await expect(fold).toBeVisible();
      await expect(disclosure).toHaveCount(0);
      const full = await boxHeight();
      const grid = await gridTop();

      // Scrolled past: one row, carrying the two controls a patient reaches
      // for most often.
      await page.evaluate(() => window.scrollTo(0, 1500));
      await expect(disclosure).toBeVisible();
      await expect(fold).toBeHidden();
      await expect(search).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Results view' })).toBeVisible();
      expect(await paintedHeight(), `${viewport.at}: the condensed bar is not meaningfully shorter`).toBeLessThan(full / 2);
      expect(await gridTop(), `${viewport.at}: condensing moved the markers`).toBe(grid);

      // Unfolding brings the rest back in place and takes the reader nowhere.
      const scrolled = await page.evaluate(() => window.scrollY);
      await disclosure.click();
      await expect(fold).toBeVisible();
      await expect(page.getByLabel('Group by')).toBeVisible();
      expect(await page.evaluate(() => window.scrollY), `${viewport.at}: unfolding scrolled the page`).toBe(scrolled);
      expect(await gridTop(), `${viewport.at}: unfolding moved the markers`).toBe(grid);

      // A filter set from the fold stays VISIBLE once the fold has gone. A
      // filter you cannot see is how somebody concludes their results have
      // vanished, so the chip and the way out of it are on the condensed row.
      await page.getByLabel('Show').click();
      await page.getByRole('option', { name: /^Above range/ }).click();
      // The fold holds itself open while it has the focus (see the bar) —
      // this is the reader turning back to the results.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(() => window.scrollBy(0, 400));
      await expect(fold).toBeHidden();
      await expect(applied.getByRole('button', { name: /Above range/ })).toBeVisible();

      // And clearing from there clears it, without disturbing the arrangement
      // the reader chose.
      await applied.getByRole('button', { name: 'Clear all filters' }).click();
      await expect(applied).toHaveCount(0);
      await expect(page.getByText('187 markers')).toBeVisible();

      // Nothing about scrolling, folding or unfolding touches what was typed.
      await search.fill('ferritin');
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(fold).toBeVisible();
      await expect(search).toHaveValue('ferritin');
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

    await page.goto('/results');
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
    await expect(page).toHaveURL(/\/results\?view=by-marker$/);
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
