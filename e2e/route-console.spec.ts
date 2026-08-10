import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * Every patient route, loaded, with the console watched.
 *
 * WHY THIS EXISTS. A whole page of results crashed in production while both
 * builds passed and twenty-three e2e specs went green. Nothing here is exotic:
 * `tsc` cannot catch it, because the failure was a `Record<MarkerStatus, …>`
 * indexed with a value that arrived over a network — `apiFetch<T>` is a cast,
 * not a parse, so the type said "one of five" and the wire never promised it.
 * And the existing specs could not catch it either, because every one of them
 * asserts that something IS on the page. A page that threw during render and
 * mounted nothing fails those assertions for the same reason a slow fetch
 * does; none of them ever asked the browser whether anything had gone wrong.
 *
 * So this spec asserts the opposite thing, and it is the cheap half of the
 * coverage: visit every route a patient can reach, in both themes, and fail on
 * any uncaught exception, any console error and any CSP violation. It does not
 * care what the page says — the other specs do that — only that loading it
 * produced no errors at all.
 *
 * It also covers the three redirected URLs, which is where the crash was
 * reported from, and the three views of the consolidated Results page under
 * empty, partial and full data — the states a screen only meets in front of a
 * real patient, driven here by rewriting the payload on its way in.
 *
 * Requires the demo patient (SEED_DEMO_DATA=true) — see README.
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

/**
 * Console noise that is not the page's fault and never indicates a broken
 * render. Deliberately tiny, and deliberately not a substring free-for-all: a
 * generous allow-list here is the same as not having this spec.
 */
const IGNORED = [
  // Vite's dev-server chatter; absent from a production build entirely.
  /\[vite\]/i,
  // A 401 on a background request during sign-out is the browser reporting a
  // response code, not an error in the page.
  /Failed to load resource: the server responded with a status of 401/i,
];

interface Watcher {
  /** Everything that would have shown up in a developer's console as an error. */
  errors: string[];
  /** Content-Security-Policy refusals, kept apart so the failure message names the cause. */
  csp: string[];
}

function watchConsole(page: Page): Watcher {
  const w: Watcher = { errors: [], csp: [] };
  const record = (text: string) => {
    if (IGNORED.some((p) => p.test(text))) return;
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(text)) w.csp.push(text);
    else w.errors.push(text);
  };
  // An exception thrown during render reaches here, not console.error — React
  // re-throws it after logging, and this is the event that catches it.
  page.on('pageerror', (e) => record(`Uncaught ${e.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') record(m.text());
  });
  return w;
}

function assertClean(w: Watcher, where: string) {
  const unique = (xs: string[]) => [...new Set(xs.map((x) => x.split('\n')[0].slice(0, 300)))];
  expect(
    unique(w.csp),
    `${where} violated the Content-Security-Policy ${w.csp.length} time(s). ` +
      `The policy is not the thing to change — find what is injecting this and serve it from a file.`,
  ).toEqual([]);
  expect(
    unique(w.errors),
    `${where} logged ${w.errors.length} console error(s). A route that throws while rendering ` +
      `shows an empty page to a patient, and every other spec passes over it in silence.`,
  ).toEqual([]);
  w.errors.length = 0;
  w.csp.length = 0;
}

/** Give the route long enough to fetch, render and settle before judging its console. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {
    /* a page holding a long poll open is not a failure — the timeout below still applies */
  });
  await page.waitForTimeout(1200);
}

async function signedInContext(browser: import('@playwright/test').Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 1000 } });
  await loginAsDemoPatient(ctx.request);
  // The stored preference, not just the OS one, so the toggle's own path is
  // covered as well as the media query's.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* ignore */
    }
  }, theme);
  return ctx;
}

/** Every route a patient can reach, including the three the Results page replaced. */
async function patientRoutes(ctx: BrowserContext): Promise<{ name: string; path: string }[]> {
  const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
    reportId: string;
    patientStatus: string;
    markerCount?: number;
  }[];
  const released = reports.filter((r) => r.patientStatus === 'RELEASED');
  const biggest = [...released].sort((a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0))[0];

  const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
    markerId: string;
    resultCount: number;
    resultType?: string;
    status: string | null;
  }[];
  const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED');
  const plottable = measured.filter((m) => m.resultCount > 1);
  // A marker whose latest result was never placed against its range — the exact
  // shape the crash was about. Skipped rather than faked if the seed has none.
  const unevaluated = markers.find((m) => m.status === null);

  return [
    { name: 'overview', path: '/overview' },
    { name: 'results (sidebar destination)', path: '/results' },
    { name: 'results — by marker', path: '/results?view=by-marker' },
    { name: 'results — compare', path: '/results?view=compare' },
    {
      name: 'results — compare with a selection',
      path: `/results?view=compare&markers=${plottable.slice(0, 3).map((m) => m.markerId).join(',')}`,
    },
    // The three destinations the consolidation replaced. Each is in somebody's
    // bookmarks, and the crash was reported from this side of the redirect.
    { name: 'legacy /my-results', path: '/my-results' },
    { name: 'legacy /markers', path: '/markers' },
    { name: 'legacy /trends', path: '/trends' },
    {
      name: 'legacy /trends with a saved comparison',
      path: `/trends?markers=${plottable.slice(0, 2).map((m) => m.markerId).join(',')}`,
    },
    { name: 'an opened report', path: `/reports/${biggest.reportId}` },
    { name: 'a marker detail page', path: `/markers/${plottable[0].markerId}` },
    ...(unevaluated
      ? [{ name: 'a marker with no status of its own', path: `/markers/${unevaluated.markerId}` }]
      : []),
    { name: 'marker library', path: '/library' },
    { name: 'documents', path: '/documents' },
    { name: 'account', path: '/account' },
    { name: 'book a test', path: '/book' },
    { name: 'appointments', path: '/appointments' },
    { name: 'a URL that does not exist', path: '/nothing-here' },
  ];
}

for (const theme of ['light', 'dark'] as const) {
  test(`every patient route loads with a clean console in ${theme} mode`, async ({ browser }) => {
    // Fifteen-plus routes, each waited on until it settles.
    test.setTimeout(300_000);
    const ctx = await signedInContext(browser, theme);
    const page = await ctx.newPage();
    const watcher = watchConsole(page);

    for (const route of await patientRoutes(ctx)) {
      await page.goto(route.path);
      await settle(page);
      // The theme actually took, so "clean in dark mode" means something.
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark, `${route.path} did not resolve to ${theme} mode`).toBe(theme === 'dark');
      assertClean(watcher, `${route.name} (${route.path}, ${theme})`);
    }

    await ctx.close();
  });
}

/**
 * The pre-paint theme script is a real file on this origin.
 *
 * It was an inline block, which the portal's `script-src 'self'` refused to run
 * on every route in production. Two things have to hold for the replacement:
 * the document must contain no inline script at all, and the file it points at
 * must actually be served AS a script — not swallowed by the SPA fallback and
 * answered with index.html, which would be a syntax error in <head> on every
 * page rather than a missing theme.
 */
test('the theme bootstrap is served as a script, not as the SPA fallback', async ({ page, request }) => {
  const res = await request.get('/theme-bootstrap.js');
  expect(res.ok(), '/theme-bootstrap.js is not being served').toBeTruthy();
  expect(res.headers()['content-type'] ?? '').toMatch(/javascript/);
  expect(await res.text()).toContain('aspire-theme');

  await page.goto('/login');
  // Everything the document itself carries, minus the dev server's own React
  // Fast Refresh preamble — that one is injected by @vitejs/plugin-react, is
  // absent from a production build entirely, and is the only inline script
  // this app cannot remove because it does not write it. Anything else here is
  // ours, and the CSP will refuse to run it in production.
  const ours = (await page.locator('script:not([src])').allTextContents()).filter(
    (t) => !/@react-refresh|__vite|RefreshRuntime/.test(t),
  );
  expect(
    ours,
    'an inline script is back in the document, and script-src \'self\' will block it in production',
  ).toEqual([]);
});

test('the three views survive empty, partial and full data', async ({ browser }) => {
  test.slow();
  const ctx = await signedInContext(browser, 'light');
  const page = await ctx.newPage();
  const watcher = watchConsole(page);

  /**
   * The three data states a view meets in the wild, and the two that only ever
   * turn up in front of a real patient.
   *
   * EMPTY is a new account: no reports, no markers, nothing to plot. PARTIAL is
   * the one that broke — a payload where some results have no status. The wire
   * carries "no status" in three ways and the code used to survive exactly one
   * of them: `null` was guarded, a missing key arrived as `undefined` and went
   * straight past that guard into a token lookup, and a status string from a
   * different build of the API did the same. FULL is the seeded data unaltered.
   */
  const shapes = [
    { name: 'empty', mutate: (body: unknown) => (Array.isArray(body) ? [] : emptyOverview(body)) },
    { name: 'partial — status null', mutate: (body: unknown) => stripStatuses(body, () => null) },
    { name: 'partial — status absent', mutate: (body: unknown) => stripStatuses(body, () => undefined) },
    { name: 'partial — status unrecognised', mutate: (body: unknown) => stripStatuses(body, () => 'NO_DATA') },
    { name: 'full', mutate: (body: unknown) => body },
  ];

  const views = [
    { name: 'by report', path: '/results' },
    { name: 'by marker', path: '/results?view=by-marker' },
    { name: 'compare', path: '/results?view=compare' },
  ];

  for (const shape of shapes) {
    await page.route('**/api/patient/**', async (route) => {
      const response = await route.fetch();
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return route.fulfill({ response });
      }
      return route.fulfill({ response, body: JSON.stringify(shape.mutate(body)) });
    });

    for (const view of views) {
      await page.goto(view.path);
      await settle(page);
      // Whatever the data, the page itself is still there — a view that threw
      // during render leaves the switch behind with it.
      await expect(
        page.getByRole('tablist', { name: 'Results view' }),
        `${view.name} did not render at all with ${shape.name} data`,
      ).toBeVisible();
      assertClean(watcher, `results "${view.name}" with ${shape.name} data`);
    }

    await page.unroute('**/api/patient/**');
  }

  await ctx.close();
});

/** An account with nothing in it yet: the shape of a brand-new self-signup. */
function emptyOverview(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const o = body as Record<string, unknown>;
  if (!('releasedReportCount' in o)) return { ...o, markers: [], categories: [] };
  return { ...o, releasedReportCount: 0, pendingReportCount: 0, latest: null, attention: [], changes: [] };
}

/**
 * Rewrite every `status`-ish field in a payload, wherever it sits — a marker
 * row, a report's markers, a spark point, a trend point, an overview change.
 * Recursive because those live at five different depths and the point is to
 * reach all of them, not to enumerate the ones we remembered.
 */
function stripStatuses(node: unknown, to: () => string | null | undefined): unknown {
  if (Array.isArray(node)) return node.map((n) => stripStatuses(n, to));
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    // Only the marker-status fields. `patientStatus` and `reviewStatus` are
    // different enums on the same payloads and rewriting them would be testing
    // something else.
    const isMarkerStatus = key === 'status' || key === 'currentStatus' || key === 'previousStatus';
    if (isMarkerStatus && (value === null || typeof value === 'string')) {
      const next = to();
      // undefined is the case that matters most, and JSON.stringify drops the
      // key entirely — which is precisely how a field stops being sent.
      if (next !== undefined) out[key] = next;
      continue;
    }
    out[key] = stripStatuses(value, to);
  }
  return out;
}
