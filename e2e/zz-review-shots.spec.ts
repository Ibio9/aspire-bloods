import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * THE SCREENS THAT WERE REWORKED, PHOTOGRAPHED WHERE THEY ACTUALLY DIFFER.
 *
 * `zz-screenshots.spec.ts` walks every route at its resting state, which is
 * the right thing for a general sweep and photographs none of these: a form
 * on its first step, a calendar that is closed, a sequence on step one, and a
 * marker page whose result happens to be in range. What changed here is
 * visible only in the states a walk does not reach —
 *
 *  · sign-up, where the fields were too tight to hold an ordinary first name;
 *  · the date picker OPEN, which is the whole of that change;
 *  · the first-sign-in introduction as a sequence rather than a document;
 *  · a marker page whose result is ABOVE its range and another BELOW it,
 *    which is where the range bar was drawing the mark on the wrong number.
 *
 * The last pair is chosen from the patient's real data rather than staged: the
 * bug was in the arithmetic, so the picture is worth nothing unless the value
 * in it is one the arithmetic was given.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`.
 */
const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots');

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

const WIDTHS = [
  { key: '', width: 1440, height: 900 },
  { key: '-mobile', width: 390, height: 844 },
] as const;
type Width = (typeof WIDTHS)[number];

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

async function themedContext(browser: Browser, theme: 'light' | 'dark', size: Width) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.width < 768,
    hasTouch: size.width < 768,
    deviceScaleFactor: size.width < 768 ? 2 : 1,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a locked-down browser is not this spec's problem */
    }
  }, theme);
  return ctx;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Entrance animations are 200–600ms; a shot taken mid-fade is a picture of an
  // animation rather than of a page.
  await page.waitForTimeout(900);

  // WALK THE PAGE BEFORE CAPTURING IT, and this is not optional for a fullPage
  // shot. Everything below the fold is wrapped in `Reveal`, which starts at
  // `opacity: 0` and is brought in by an IntersectionObserver — and a fullPage
  // screenshot does not scroll, so every section that has never been in view
  // photographs BLANK. The first pass of these shots came back with four empty
  // headings on the Overview, which reads exactly like a broken layout and is
  // not one. Same walk as zz-screenshots.spec.ts, and the same reason.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

interface MarkerRow {
  markerId: string;
  name: string;
  status: string | null;
  resultType?: string;
  resultCount: number;
}

test.describe('review shots', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 360_000 });

  for (const size of WIDTHS) {
    test(`sign-up, the date picker and the welcome sequence${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        const page = await ctx.newPage();

        // --- Sign-up, step one: the row that could not hold a first name ---
        await page.goto('/signup');
        await settle(page);
        await page.screenshot({ path: path.join(OUT, `signup-${theme}${size.key}.png`), fullPage: true });

        // A real name in the box, because "is this wide enough" is a question
        // about content and not about an empty field.
        await page.getByLabel('Email address').fill('ibrahim.malik@example.com');
        await page.getByLabel('First name').fill('Ibrahim');
        await page.getByLabel('Last name').fill('Malik');
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, `signup-filled-${theme}${size.key}.png`), fullPage: true });

        // --- Step two: the date of birth picker, open ---
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByLabel('Date of birth')).toBeVisible();
        await page.getByRole('button', { name: 'Open calendar' }).click();
        await expect(page.getByRole('dialog', { name: 'Choose a date' })).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `signup-datepicker-${theme}${size.key}.png`), fullPage: true });

        // The year list open on top of it — the control this change is about.
        await page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: /^Year/ }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(OUT, `signup-datepicker-years-${theme}${size.key}.png`),
          fullPage: true,
        });
        await page.keyboard.press('Escape');

        await ctx.close();
      }
    });

    test(`the welcome sequence, every step${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        await login(ctx.request);
        const page = await ctx.newPage();
        await page.goto('/welcome');
        await settle(page);

        // Every step, in order. Stopping at the last rather than pressing "Go
        // to my results", so the demo patient's own walkthrough flag is not
        // spent by taking a photograph of it.
        for (let step = 1; step <= 4; step += 1) {
          await page.screenshot({
            path: path.join(OUT, `welcome-step${step}-${theme}${size.key}.png`),
            fullPage: true,
          });
          const next = page.getByRole('button', { name: 'Continue' });
          if (!(await next.isVisible().catch(() => false))) break;
          await next.click();
          await page.waitForTimeout(400);
        }

        await ctx.close();
      }
    });

    test(`a marker above its range and one below it${size.key ? ' — mobile' : ''}`, async ({ browser }) => {
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark'] as const) {
        const ctx = await themedContext(browser, theme, size);
        await login(ctx.request);
        const page = await ctx.newPage();

        const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as MarkerRow[];
        const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED');
        const pick = (statuses: string[]) => measured.find((m) => m.status && statuses.includes(m.status));

        // Significantly out first — the case that was drawing the mark pinned
        // to the end of the bar under a label reading the reference bound.
        const above = pick(['SIGNIFICANT_HIGH']) ?? pick(['HIGH']);
        const below = pick(['SIGNIFICANT_LOW']) ?? pick(['LOW']);
        expect(above, 'no marker is above its range — run the demo seed').toBeTruthy();
        expect(below, 'no marker is below its range — run the demo seed').toBeTruthy();

        for (const [label, marker] of [
          ['above', above],
          ['below', below],
        ] as const) {
          await page.goto(`/markers/${marker!.markerId}`);
          await settle(page);
          await page.screenshot({
            path: path.join(OUT, `marker-${label}-range-${theme}${size.key}.png`),
            fullPage: true,
          });
        }

        // And the collapsed section, which is a layout question rather than a
        // colour one — the contact card used to sit beside an empty two-thirds.
        await page.goto('/overview');
        await settle(page);
        const toggle = page.getByRole('button', { name: /Worth a conversation/ });
        if (await toggle.isVisible().catch(() => false)) {
          await toggle.click();
          await page.waitForTimeout(500);
          await page.screenshot({
            path: path.join(OUT, `attention-collapsed-${theme}${size.key}.png`),
            fullPage: true,
          });
          // Left as it was found: the preference is stored per patient.
          await toggle.click();
        }

        await ctx.close();
      }
    });
  }
});
