import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Every admin route, loaded, with the console watched.
 *
 * The sibling of route-console.spec.ts, and it exists for the same reason: a
 * page that throws during render mounts nothing, and every spec that asserts
 * something IS on the page fails that identically to a slow fetch. None of
 * them ever asks the browser whether anything went wrong.
 *
 * The admin console needs its own because it is where the console-clean-up
 * work landed: sections moved between screens, a nav grid was removed, and two
 * screens grew panels that fetch from endpoints nothing used to call. Those
 * are exactly the changes that produce a route which typechecks, builds, and
 * throws on mount.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's admin account.
 */

const IGNORED = [
  /\[vite\]/i,
  /Failed to load resource: the server responded with a status of 401/i,
  // Randox is switched off in development, so the panels page's mapping
  // section and the ingestion log's unknown-codes panel both get a 503 from
  // an endpoint they call optionally. Both render nothing in that case, by
  // design — the browser logging the status code is not the page failing.
  /Failed to load resource: the server responded with a status of 503/i,
];

interface Watcher {
  errors: string[];
  csp: string[];
}

function watchConsole(page: Page): Watcher {
  const w: Watcher = { errors: [], csp: [] };
  const record = (text: string) => {
    if (IGNORED.some((p) => p.test(text))) return;
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(text)) w.csp.push(text);
    else w.errors.push(text);
  };
  page.on('pageerror', (e) => record(`Uncaught ${e.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') record(m.text());
  });
  return w;
}

function assertClean(w: Watcher, where: string) {
  const unique = (xs: string[]) => [...new Set(xs.map((x) => x.split('\n')[0].slice(0, 300)))];
  expect(unique(w.csp), `${where} violated the Content-Security-Policy`).toEqual([]);
  expect(
    unique(w.errors),
    `${where} logged ${w.errors.length} console error(s). An admin screen that throws while rendering ` +
      `is a screen the clinic cannot do its day’s work on.`,
  ).toEqual([]);
  w.errors.length = 0;
  w.csp.length = 0;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {
    /* a long-lived request is not a failure */
  });
  await page.waitForTimeout(800);
}

async function signInAsAdmin(page: Page) {
  const request: APIRequestContext = page.request;
  const login = await request.post('/api/auth/login', {
    data: { email: 'admin@aspireshield.dev', password: process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!' },
  });
  expect(login.ok(), 'the seeded admin account must exist').toBeTruthy();
  const body = await login.json();
  if (body.status !== 'authenticated') {
    const otp = await request.post('/api/auth/otp/verify', {
      data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
    });
    expect(otp.ok()).toBeTruthy();
  }
}

test('every admin route loads with a clean console', async ({ page }) => {
  // Thirteen routes, each of which is loaded, settled for 800ms and read for
  // console output. Every route split out into its own chunk (Aug 2026) adds a
  // fetch to that, and the default 30s stopped covering the list.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const watcher = watchConsole(page);
  await signInAsAdmin(page);

  // A real patient and a real report from the seed, so the two detail routes
  // are exercised with data rather than with a 404 branch.
  const patients = (await (await page.request.get('/api/admin/patients')).json()) as { id: string }[];
  const reports = (await (await page.request.get('/api/reports')).json()) as { id: string }[];

  /**
   * ── FIVE SCREENS, AND SIX REDIRECTS (Aug 2026) ──────────────────────────
   *
   * Overview · Reports · Patients · Analytics · Settings, plus the two detail
   * routes. The six closed paths are still walked here, because a redirect that
   * throws is a 404 with extra steps and every one of them is in somebody's
   * bookmarks.
   */
  const routes: { name: string; path: string }[] = [
    { name: 'Overview', path: '/' },
    { name: 'Reports', path: '/admin' },
    { name: 'Reports filtered by status', path: '/admin?status=PARSED' },
    // HELD is a queue bucket rather than a status — PARSED covers both held and
    // read-but-not-released, so the two filters are separate URLs.
    { name: 'Reports filtered to the held queue', path: '/admin?queue=HELD' },
    { name: 'Patients', path: '/admin/patients' },
    { name: 'Analytics', path: '/admin/analytics' },
    { name: 'Settings', path: '/admin/settings' },
    // Every section, arrived at by its own hash — the form the six redirects
    // below land in.
    { name: 'Settings · packages', path: '/admin/settings#packages' },
    { name: 'Settings · marker library', path: '/admin/settings#markers' },
    { name: 'Settings · ingestion log', path: '/admin/settings#ingestion-log' },
    { name: 'Settings · audit log', path: '/admin/settings#audit-log' },
    { name: 'Settings · backup', path: '/admin/settings#backup' },
    // The six closed routes. Kept as redirects rather than removed — they are
    // in browser histories, in bookmarks and in at least one server-side error
    // message.
    { name: 'Legacy work queue', path: '/admin/queue' },
    { name: 'Legacy result linking', path: '/admin/linking' },
    { name: 'Legacy panels', path: '/admin/panels' },
    { name: 'Legacy content path', path: '/admin/content' },
    { name: 'Legacy marker library', path: '/admin/markers' },
    { name: 'Legacy audit log', path: '/admin/audit-log' },
    { name: 'Legacy ingestion log', path: '/admin/ingestion-log' },
  ];
  if (patients[0]) routes.push({ name: 'Patient detail', path: `/admin/patients/${patients[0].id}` });
  if (reports[0]) routes.push({ name: 'Report detail', path: `/admin/reports/${reports[0].id}` });

  for (const route of routes) {
    await page.goto(route.path);
    await settle(page);
    // The shell mounted at all — a thrown render leaves the document empty and
    // there would be no navigation landmark to find.
    await expect(page.getByRole('navigation', { name: 'Clinician console navigation' }), `${route.name} rendered the shell`).toBeVisible();
    assertClean(watcher, `${route.name} (${route.path})`);
  }
});

/**
 * ── THE SIX CLOSED ROUTES ALL REDIRECT, AND FOUR CARRY A HASH ─────────────
 *
 * Nine console screens became five (Aug 2026). None of the four that lost a
 * route 404s: they are in bookmarks, in browser histories and — for the two
 * logs — in a server-side error message. The four that landed in Settings carry
 * a hash, because a redirect that drops somebody on a page of shut disclosures
 * answers "where is the audit log" with "somewhere under one of these".
 */
const REDIRECTS: { from: string; to: RegExp; opens?: string }[] = [
  { from: '/admin/queue', to: /\/$/ },
  { from: '/admin/linking', to: /\/admin#unmatched$/ },
  { from: '/admin/panels', to: /\/admin\/settings#packages$/, opens: 'Edit packages' },
  { from: '/admin/content', to: /\/admin\/settings#packages$/, opens: 'Edit packages' },
  { from: '/admin/markers', to: /\/admin\/settings#markers$/, opens: 'Marker library' },
  { from: '/admin/ingestion-log', to: /\/admin\/settings#ingestion-log$/, opens: 'Ingestion log' },
  { from: '/admin/audit-log', to: /\/admin\/settings#audit-log$/, opens: 'Audit log' },
];

for (const redirect of REDIRECTS) {
  test(`${redirect.from} redirects rather than 404ing`, async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(redirect.from);
    await expect(page).toHaveURL(redirect.to);
    if (redirect.opens) {
      // AND THE SECTION IS OPEN. This is the half a URL check cannot make: the
      // hash has to actually expand its disclosure, or the redirect is a
      // redirect to a closed door.
      await expect(page.getByRole('button', { name: redirect.opens })).toHaveAttribute('aria-expanded', 'true');
    }
  });
}

test('the landing screen is Overview: what needs doing, then the headlines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  await page.goto('/');
  await settle(page);

  /**
   * ── OVERVIEW REPLACED THE WORK QUEUE, WHICH REPLACED THE CONSOLE ────────
   *
   * All three answered "what is waiting for you", and each was the previous one
   * with the parts that were not that question taken off. Overview is the work
   * queue minus the bucket summary, the turnaround band and the backup band,
   * plus three analytics headlines.
   *
   * TWO SECTIONS, IN ONE ORDER, AND NOTHING ELSE.
   */
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('What needs doing', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Analytics · last \d+ days$/)).toBeVisible();

  // ── THE FOUR BANDS THAT CAME OFF ─────────────────────────────────────────
  // Each moved somewhere it belongs rather than being deleted: the backup to
  // Settings, the turnaround to Analytics, and the bucket summary nowhere,
  // because it was a second arrangement of the list directly beneath it.
  // Matched on the band HEADINGS the work queue printed, not on loose phrases:
  // "median arrival to release" is one of the three headlines and is meant to
  // be here, so `/Arrival to release/` would fail on the thing that replaced
  // the band rather than on the band.
  for (const gone of [
    /^Off-platform backup$/,
    /^Where the open reports are$/,
    /^Arrival to release, last \d+ days$/,
    /^The list( \(\d+\))?$/,
  ]) {
    await expect(page.getByText(gone), `${gone} is not on the landing screen any more`).toHaveCount(0);
  }

  /**
   * ── AND THE PROSE IS GONE ────────────────────────────────────────────────
   *
   * The old screen carried a purpose line, a sentence about the figures being
   * derived rather than tracked, a `why` paragraph under each of three
   * exception cards and a note under the turnaround block — five explanations
   * above a work list, read by a clinician every morning. The target is that no
   * console screen carries more than ONE sentence of prose above the data, and
   * this one carries none: the heading is the sentence.
   */
  const main = page.locator('main');
  await expect(main.getByText(/nothing on this screen is tracked separately/i)).toHaveCount(0);
  await expect(main.getByText(/Everything waiting on somebody, longest first/i)).toHaveCount(0);

  // And what it is not for. A grid of navigation cards duplicating the sidebar
  // is what the old console had, incompletely; nothing may bring it back.
  for (const label of ['Reports', 'Patients', 'Settings']) {
    await expect(
      main.getByRole('link', { name: label, exact: true }),
      `"${label}" is a sidebar destination and must not be restated as a card in the page body`,
    ).toHaveCount(0);
  }
});

test('the sidebar is five items with no sublabels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  await page.goto('/');
  await settle(page);

  const nav = page.getByRole('navigation', { name: 'Clinician console navigation' });
  /**
   * FIVE, and the count is the assertion. Nine peers is an index rather than a
   * navigation, and the two band headings that existed to say which three of
   * the nine mattered went with them.
   */
  await expect(nav.getByRole('link')).toHaveCount(5);
  for (const label of ['Overview', 'Reports', 'Patients', 'Analytics', 'Settings']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  // The two band headings are gone with the four entries they separated.
  for (const heading of ['Every day', 'Records & setup']) {
    await expect(nav.getByText(heading, { exact: true })).toHaveCount(0);
  }
  /**
   * NO SUBLABELS. A label that needs one to be understood needs rewriting, and
   * these carried `truncate` — so four of them were cut off mid-word, which is
   * a line whose whole job is removing ambiguity, removed halfway through.
   * Measured as "a nav link is one line of text", which is what that means.
   */
  const lineCounts = await nav.locator('a').evaluateAll((links) =>
    links.map((a) => (a.textContent ?? '').trim().split('\n').filter(Boolean).length),
  );
  for (const [i, count] of lineCounts.entries()) {
    expect(count, `nav link ${i} carries ${count} lines of text — a sublabel is back`).toBe(1);
  }
});

test('Reports carries the unmatched results that used to be their own screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  await page.goto('/admin');
  await settle(page);

  // A separate page for one class of report meant two places to look for the
  // same thing. The anchor is what the Overview's own row links to.
  await expect(page.locator('#unmatched')).toHaveCount(1);
  await expect(page.getByText('Results nobody could place')).toBeVisible();
  // ONE page heading. The absorbed screen's own title and purpose line are
  // suppressed by ConsoleSection — two page titles on one page is the thing
  // this restructure exists to remove.
  await expect(page.getByRole('heading', { name: 'Result linking' })).toHaveCount(0);
});
