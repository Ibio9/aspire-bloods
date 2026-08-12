import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * "WORTH A CONVERSATION", OPEN AND COLLAPSED.
 *
 * The section a patient meets first when something is outside the range, and
 * the one that made the Overview 36,800px tall on a phone. Four pictures per
 * state so the two can be compared where they actually differ: desktop and
 * mobile, light and dark.
 *
 * CROPPED TO THE SECTION rather than fullPage. A 36,000px strip is unreadable
 * at any size somebody will open it at, and what is being reviewed here is the
 * heading row, the count line, the chevron and whether the "Talk to someone"
 * card moved — all of which are in the first screen of it.
 *
 * It also ASSERTS the two things a picture cannot show: that the contact card
 * does not move or resize when the list folds away, and that the preference
 * survives a reload.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_SCREENSHOTS=1`.
 */
const RUN = process.env.E2E_SCREENSHOTS === '1';
const OUT = path.resolve('screenshots');
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

const SIZES = [
  { key: '', width: 1440, height: 900 },
  { key: '-mobile', width: 390, height: 844 },
] as const;

test.describe('worth a conversation', () => {
  test.skip(!RUN, 'set E2E_SCREENSHOTS=1 to write screenshots');
  test.describe.configure({ timeout: 300_000 });

  for (const size of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`open and collapsed, ${theme}${size.key}`, async ({ browser }: { browser: Browser }) => {
        fs.mkdirSync(OUT, { recursive: true });
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
            /* ignore */
          }
        }, theme);
        await login(ctx.request);
        const page = await ctx.newPage();
        await page.goto('/overview');

        const toggle = page.getByRole('button', { name: /Worth a conversation/ });
        await toggle.waitFor({ timeout: 60_000 });
        await page.waitForTimeout(900);

        // OPEN BY DEFAULT.
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const region = page.locator('#attention-results');
        await expect(region).toBeVisible();

        const section = page.locator('section[aria-labelledby="attention-heading"]');
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await page.screenshot({
          path: path.join(OUT, `attention-open-${theme}${size.key}.png`),
          clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 900) },
        });

        // WHERE THE CONTACT CARD IS, before and after. The brief's requirement
        // is that it does not move or resize when the list folds, which is a
        // measurement rather than an impression — the card is a sibling in its
        // own grid column precisely so that collapsing the list cannot touch it.
        const contact = page.getByText('Talk to someone').first();
        const before = await contact.boundingBox();

        await toggle.click();
        // Past the 220ms height transition.
        await page.waitForTimeout(700);
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        // THE FACT STAYS. The heading and the count line are outside the region.
        await expect(page.getByText(/of your markers sit\s+outside the usual reference range|One of your markers sits/)).toBeVisible();

        const after = await contact.boundingBox();
        expect(before, 'no contact card to measure').not.toBeNull();
        expect(after, 'the contact card vanished when the list collapsed').not.toBeNull();
        expect(Math.round(after!.x), `${theme}${size.key}: the contact card moved horizontally`).toBe(Math.round(before!.x));
        expect(Math.round(after!.width), `${theme}${size.key}: the contact card changed width`).toBe(
          Math.round(before!.width),
        );
        // Vertically it holds on desktop, where it is in its own column. On a
        // phone the grid is one column and it necessarily rises — which is the
        // correct behaviour there and would be wrong to assert against.
        if (size.width >= 1024) {
          expect(Math.round(after!.y), `${theme}: the contact card moved vertically`).toBe(Math.round(before!.y));
        }

        await page.screenshot({
          path: path.join(OUT, `attention-collapsed-${theme}${size.key}.png`),
          clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 900) },
        });

        // PERSISTED PER PATIENT, surviving a reload.
        await page.reload();
        await toggle.waitFor({ timeout: 30_000 });
        await page.waitForTimeout(600);
        await expect(toggle, 'the collapsed state did not survive a reload').toHaveAttribute('aria-expanded', 'false');

        // ESCAPE closes it when focus is inside, and focus lands on the disclosure.
        await toggle.click();
        await page.waitForTimeout(500);
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await page.locator('#attention-results a').first().focus();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await expect(toggle, 'Escape did not close it').toHaveAttribute('aria-expanded', 'false');
        await expect(toggle, 'focus was not returned to the disclosure').toBeFocused();

        await ctx.close();
      });
    }
  }
});
