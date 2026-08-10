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
      `is a screen the clinic cannot do its day's work on.`,
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  const watcher = watchConsole(page);
  await signInAsAdmin(page);

  // A real patient and a real report from the seed, so the two detail routes
  // are exercised with data rather than with a 404 branch.
  const patients = (await (await page.request.get('/api/admin/patients')).json()) as { id: string }[];
  const reports = (await (await page.request.get('/api/reports')).json()) as { id: string }[];

  const routes: { name: string; path: string }[] = [
    { name: 'Console', path: '/' },
    { name: 'Reports & entry', path: '/admin' },
    { name: 'Reports filtered by status', path: '/admin?status=ADMIN_VERIFIED' },
    { name: 'Patients', path: '/admin/patients' },
    { name: 'Result linking', path: '/admin/linking' },
    { name: 'Panels', path: '/admin/panels' },
    { name: 'Marker library', path: '/admin/markers' },
    { name: 'Audit log', path: '/admin/audit-log' },
    { name: 'Ingestion log', path: '/admin/ingestion-log' },
    // Kept as a redirect rather than removed — it is in browser histories.
    { name: 'Legacy content path', path: '/admin/content' },
  ];
  if (patients[0]) routes.push({ name: 'Patient detail', path: `/admin/patients/${patients[0].id}` });
  if (reports[0]) routes.push({ name: 'Report detail', path: `/admin/reports/${reports[0].id}` });

  for (const route of routes) {
    await page.goto(route.path);
    await settle(page);
    // The shell mounted at all — a thrown render leaves the document empty and
    // there would be no navigation landmark to find.
    await expect(page.getByRole('navigation', { name: 'Admin navigation' }), `${route.name} rendered the shell`).toBeVisible();
    assertClean(watcher, `${route.name} (${route.path})`);
  }
});

test('the old content path redirects rather than 404ing', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/content');
  await expect(page).toHaveURL(/\/admin\/panels$/);
});

test('the console says what is waiting, and does not restate the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  await page.goto('/');
  await settle(page);

  // What the console is for.
  await expect(page.getByText(/Reports awaiting action/i)).toBeVisible();
  await expect(page.getByText(/Results that could not be placed/i)).toBeVisible();

  // And what it is not for. The grid of navigation cards duplicated the
  // sidebar — incompletely, missing result linking and the ingestion log —
  // so an admin had two maps of the same console that disagreed.
  const main = page.locator('main');
  for (const label of ['Panels', 'Marker library', 'Audit log']) {
    await expect(
      main.getByRole('link', { name: label, exact: true }),
      `"${label}" is a sidebar destination and must not be restated as a card in the page body`,
    ).toHaveCount(0);
  }
});
