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

        // WHERE THE CONTACT CARD IS, before and after — and the requirement
        // CHANGED (Aug 2026), so this measures the new one.
        //
        // It used to be "the card must not move or resize when the list
        // folds", which the card being a sibling in its own grid column made
        // structurally true. What that produced on screen was a card sitting
        // alone in the right-hand third with the left two thirds empty, which
        // reads as a rendering fault rather than as a folded section. So the
        // grid drops to ONE column when the section is collapsed, and what has
        // to hold instead is: the card moves LEFT (no empty column beside it)
        // and does not stretch to the width of the page (a full-width contact
        // card is a banner, and this is the calmest thing in the section).
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

        const sectionBox = await section.boundingBox();
        if (size.width >= 1024) {
          // NO EMPTY COLUMN. The card starts where the section does, give or
          // take the card's own padding — not two thirds of the way across it.
          expect(
            Math.round(after!.x),
            `${theme}: the contact card is still in the right-hand column, with nothing beside it`,
          ).toBeLessThan(Math.round(before!.x));
          // Measured on the card's own copy rather than its border box, so
          // the allowance is the card's padding (28px) plus a little.
          expect(
            Math.abs(after!.x - sectionBox!.x),
            `${theme}: the card is ${Math.round(after!.x - sectionBox!.x)}px from the start of the section, not at it`,
          ).toBeLessThan(48);
          // And not a banner: it keeps a card's width rather than the page's.
          expect(after!.width, `${theme}: the contact card stretched to the full width`).toBeLessThan(sectionBox!.width * 0.75);
        } else {
          // On a phone the grid is one column open OR shut, so the card is
          // where it always was and only rises as the list folds away.
          expect(Math.round(after!.x), `${theme}-mobile: the card moved sideways on a one-column layout`).toBe(
            Math.round(before!.x),
          );
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
