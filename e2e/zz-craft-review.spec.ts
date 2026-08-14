import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * THE CRAFT REVIEW WALK — viewport shots, not full-page ones.
 *
 * The existing `zz-screenshots` walk photographs whole documents, which is the
 * right picture for "did this page mount and is anything obviously broken" and
 * the wrong one for judging craft: a 15,000px column scaled to fit a screen
 * tells you nothing about how much air sits between a heading and the first
 * card. This one captures what a reader actually sees — one viewport at a
 * time, at a handful of scroll depths — and it covers the screens the other
 * walk never reaches.
 *
 * SKIPPED UNLESS ASKED FOR: `E2E_CRAFT=1`. Same reasoning as the other walk.
 */

const RUN = process.env.E2E_CRAFT === '1';
const OUT = path.resolve('screenshots/craft');

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
const ADMIN_EMAIL = 'admin@aspireshield.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!';

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

const WIDTHS = [
  { key: '', width: 1440, height: 900 },
  { key: '-m', width: 390, height: 844 },
] as const;

type Width = (typeof WIDTHS)[number];

async function themedContext(browser: Browser, theme: 'light' | 'dark', size: Width) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.width < 768,
    hasTouch: size.width < 768,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* ignore */
    }
  }, theme);
  return ctx;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(700);
  // Reveal is an IntersectionObserver; walk the page so nothing below the fold
  // is photographed at opacity 0.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.body.scrollHeight, 30000); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

/** One viewport at the top, and two more down the page where there is one. */
async function shots(page: Page, name: string, depths = [0, 1, 2]) {
  fs.mkdirSync(OUT, { recursive: true });
  const h = page.viewportSize()?.height ?? 900;
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  for (const d of depths) {
    const y = d * h;
    if (d > 0 && y > docHeight - h * 0.4) break;
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${name}${d ? `-${d}` : ''}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('craft review', () => {
  test.skip(!RUN, 'set E2E_CRAFT=1');
  test.describe.configure({ timeout: 900_000 });

  for (const size of WIDTHS) {
    test(`unauthenticated screens${size.key}`, async ({ browser }) => {
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        const page = await ctx.newPage();
        const tag = `${theme}${size.key}`;

        for (const [name, url] of [
          ['login', '/login'],
          ['signup', '/signup'],
          ['forgot', '/forgot-password'],
          ['reset', '/reset-password?token=notarealtoken'],
          ['notfound', '/nowhere-at-all'],
        ] as const) {
          await page.goto(url);
          await settle(page);
          await shots(page, `${name}-${tag}`, [0, 1]);
        }

        // The 2FA step, reached by actually signing in.
        await page.goto('/login');
        await settle(page);
        await page.getByLabel('Email').fill(DEMO_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForTimeout(1800);
        await shots(page, `otp-${tag}`, [0]);

        // A sign-in error, in the product's own voice.
        await page.goto('/login');
        await settle(page);
        await page.getByLabel('Email').fill('nobody@example.com');
        await page.getByLabel('Password', { exact: true }).fill('wrongpassword1!');
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForTimeout(1500);
        await shots(page, `login-error-${tag}`, [0]);

        await ctx.close();
      }
    });

    test(`patient screens${size.key}`, async ({ browser }) => {
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        await login(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
        const page = await ctx.newPage();
        const tag = `${theme}${size.key}`;

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
        }[];
        const plottable = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount > 1);

        const routes: [string, string, number[]?][] = [
          ['overview', '/overview', [0, 1, 2, 3]],
          ['by-marker', '/results', [0, 1, 2]],
          ['by-test', '/results?view=by-test', [0, 1]],
          ['compare-empty', '/results?view=compare', [0, 1]],
          ['compare', `/results?view=compare&markers=${plottable.slice(0, 3).map((m) => m.markerId).join(',')}`, [0, 1, 2]],
          ['report', `/reports/${biggest.reportId}`, [0, 1, 2, 3]],
          ['marker', `/markers/${plottable[0].markerId}`, [0, 1, 2]],
          ['library', '/library', [0, 1, 2]],
          ['documents', '/documents', [0, 1]],
          ['account', '/account', [0, 1, 2]],
          ['welcome', '/welcome', [0, 1]],
        ];

        for (const [name, url, depths] of routes) {
          await page.goto(url);
          await settle(page);
          await shots(page, `${name}-${tag}`, depths ?? [0, 1]);
        }

        // The filters panel open — a state nothing else photographs.
        await page.goto('/results');
        await settle(page);
        const filters = page.getByRole('button', { name: /filter/i }).first();
        if (await filters.isVisible().catch(() => false)) {
          await filters.click();
          await page.waitForTimeout(500);
          await shots(page, `filters-${tag}`, [0]);
        }

        await ctx.close();
      }
    });

    test(`clinician console${size.key}`, async ({ browser }) => {
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        await login(ctx.request, ADMIN_EMAIL, ADMIN_PASSWORD);
        const page = await ctx.newPage();
        const tag = `${theme}${size.key}`;

        // `/api/reports`, not `/api/admin/reports` — the latter is not a route,
        // so the first version of this silently produced no report-detail shot
        // at all and the screen a clinician spends most of their day on went
        // uncaptured. Prefer one still in the pipeline: the review and release
        // controls only render on an open report.
        const list = (await (await ctx.request.get('/api/reports')).json()) as {
          id: string;
          status: string;
          voidedAt: string | null;
        }[];
        const first = list?.find((r) => !r.voidedAt && r.status !== 'RELEASED') ?? list?.[0];

        const routes: [string, string, number[]?][] = [
          ['console', '/admin', [0, 1, 2]],
          ['queue', '/admin/queue', [0, 1, 2]],
          ['patients', '/admin/patients', [0, 1]],
          ['panels', '/admin/panels', [0, 1, 2]],
          ['markers', '/admin/markers', [0, 1, 2]],
          ['ingestion', '/admin/ingestion-log', [0, 1, 2]],
          ['linking', '/admin/linking', [0, 1]],
          ['audit', '/admin/audit-log', [0, 1]],
        ];
        if (first) routes.push(['report-detail', `/admin/reports/${first.id}`, [0, 1, 2, 3]]);

        for (const [name, url, depths] of routes) {
          await page.goto(url);
          await settle(page);
          await shots(page, `adm-${name}-${tag}`, depths ?? [0, 1]);
        }

        await ctx.close();
      }
    });
  }
});
