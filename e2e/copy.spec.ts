import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * House style, checked against what is actually on the screen.
 *
 * Two rules, and both are the kind that a source-code grep gets wrong in both
 * directions: it misses copy that arrives from the database or is assembled at
 * runtime, and it flags every code comment in the repository. So this reads the
 * rendered text of the patient portal instead.
 *
 * No em dashes. They are replaced by a comma, a full stop or a rewrite. An EN
 * dash is a different character and is correct in a numeric range ("35–50
 * g/L"), so only the em dash is refused.
 *
 * And no American spellings of the words this product actually uses, since the
 * whole vocabulary of a results page runs through "haemoglobin", "anaemia" and
 * "paediatric".
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
const ADMIN_EMAIL = 'admin@aspireshield.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!';

const AMERICANISMS = [
  'hemoglobin',
  'anemia',
  'pediatric',
  'color',
  'analyze',
  'normalize',
  'center for',
  'fiber',
];

async function loginAsDemoPatient(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'demo patient could not complete 2FA').toBeTruthy();
}

/** Every line of visible text on the page, so a failure names the sentence rather than the URL. */
async function visibleLines(page: Page): Promise<string[]> {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

test('no em dashes and British spelling across the patient portal', async ({ browser }) => {
  test.setTimeout(300_000);
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

  const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
    markerId: string;
    resultCount: number;
    resultType?: string;
    optimal?: unknown;
  }[];
  const plottable = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount > 1);
  // A marker WITH an optimal band, so the guideline citation that sits under
  // "Source:" is on screen and gets checked too.
  const withOptimal = markers.find((m) => m.optimal) ?? plottable[0];

  const routes = [
    '/overview',
    '/results',
    '/results?view=by-marker',
    `/results?view=compare&markers=${plottable.slice(0, 2).map((m) => m.markerId).join(',')}`,
    `/reports/${biggest.reportId}`,
    `/markers/${withOptimal.markerId}`,
    '/library',
    '/documents',
    '/account',
  ];

  const offences: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    for (const line of await visibleLines(page)) {
      if (line.includes('—')) offences.push(`${route}  EM DASH  ${line.slice(0, 140)}`);
      const lower = line.toLowerCase();
      for (const word of AMERICANISMS) {
        if (lower.includes(word)) offences.push(`${route}  US SPELLING "${word}"  ${line.slice(0, 140)}`);
      }
    }
  }

  expect(offences, `\n${offences.join('\n')}\n`).toEqual([]);
  await ctx.close();
});

/**
 * ── AND THE CONSOLE, WHICH HAD NEVER BEEN CHECKED (Aug 2026) ───────────────
 *
 * The spec above walks the patient portal and stops there, so the clinician
 * console had no house-style coverage at all — and it had accumulated EIGHT em
 * dashes in copy a person reads every working day: the result-linking
 * standfirst, four sentences in the analyte mapping panel, two in the Randox
 * mapping section, and the "no duration" glyph in the work queue.
 *
 * The clinician side is not exempt from house style. It is the same product,
 * written by the same hand, and read more often by the people paying for it
 * than any patient screen is. The AMERICANISMS list applies here for the same
 * reason: this is where the word "haemoglobin" is typed into a marker
 * catalogue.
 *
 * Separate test rather than another route array on the one above, because it
 * needs a different account, and a failure should say which side of the
 * product it is on without anybody reading the URL.
 */
test('no em dashes and British spelling across the clinician console', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const login = await ctx.request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const body = await login.json();
  if (body.status !== 'authenticated') {
    const otp = await ctx.request.post('/api/auth/otp/verify', {
      data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
    });
    expect(otp.ok(), 'admin could not complete 2FA').toBeTruthy();
  }
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const reports = (await (await ctx.request.get('/api/reports')).json()) as { id: string }[];

  const routes = [
    '/',
    '/admin',
    '/admin/queue',
    '/admin/patients',
    '/admin/panels',
    '/admin/markers',
    '/admin/ingestion-log',
    '/admin/linking',
    '/admin/audit-log',
    ...(reports?.[0] ? [`/admin/reports/${reports[0].id}`] : []),
  ];

  const offences: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    for (const line of await visibleLines(page)) {
      if (line.includes('—')) offences.push(`${route}  EM DASH  ${line.slice(0, 140)}`);
      const lower = line.toLowerCase();
      for (const word of AMERICANISMS) {
        if (lower.includes(word)) offences.push(`${route}  US SPELLING "${word}"  ${line.slice(0, 140)}`);
      }
    }
  }

  expect(offences, `\n${offences.join('\n')}\n`).toEqual([]);
  await ctx.close();
});
