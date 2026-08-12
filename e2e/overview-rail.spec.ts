import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * THE SECTION RAIL, MEASURED RATHER THAN REVIEWED.
 *
 * A vertical index of the Overview's own sections, in the gutter between the
 * sidebar and the content column. Almost everything about it is a geometric
 * claim, and the two that matter most are claims about things NOT touching:
 *
 *   · it must not collide with the content column at any width
 *   · it must not overlap the sidebar
 *
 * Neither is something a screenshot settles. Two boxes overlapping by four
 * pixels looks like a design decision in a picture and like a bug on a laptop,
 * which is the same reason previous-results-layout.spec.ts exists. So the boxes
 * are read off the page at three widths, including the narrowest one that shows
 * the rail at all — 1280px with the sidebar expanded, where the whole of the
 * free space is `main`'s own padding and there is nothing to spare.
 *
 * The rest is behaviour that has to survive: the dots are real links (so the
 * rail works before hydration and with JavaScript off), the filled one tracks
 * the section being read, and it is absent on a phone.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** The order the sections render in, which is the order the rail lists them. */
const SECTIONS = [
  { id: 'worth-a-conversation', label: 'Worth a conversation' },
  { id: 'recent-panel', label: 'Your most recent panel' },
  { id: 'go-deeper', label: 'Go deeper' },
  { id: 'whats-changed', label: 'What’s changed' },
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

/** Which dot is filled, by its label. */
async function activeLabel(page: Page): Promise<string | null> {
  const active = page.locator('.section-rail__link.is-active');
  if ((await active.count()) === 0) return null;
  return (await active.first().innerText()).trim();
}

test.describe('the Overview section rail', () => {
  test('sits in the gutter without touching the sidebar or the content, at every width', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

    // 1280 is the breakpoint itself and therefore the worst case: `main` has
    // 80px of padding, the content column fills everything inside it, and the
    // rail has to live in that 80px. 1440 is the common laptop. 1920 is where
    // the column starts centring and the gutter grows.
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);

      const box = await page.evaluate(() => {
        const rail = document.querySelector('.section-rail')?.getBoundingClientRect();
        const aside = document.querySelector('aside')?.getBoundingClientRect();
        const column = document.querySelector('main > div')?.getBoundingClientRect();
        return rail && aside && column
          ? {
              railLeft: rail.left,
              railRight: rail.right,
              asideRight: aside.right,
              columnLeft: column.left,
            }
          : null;
      });
      expect(box, `no rail at ${width}px`).not.toBeNull();

      expect(
        box!.railLeft,
        `${width}px: the rail starts at ${Math.round(box!.railLeft)} and the sidebar ends at ${Math.round(box!.asideRight)}`,
      ).toBeGreaterThan(box!.asideRight);
      expect(
        box!.railRight,
        `${width}px: the rail ends at ${Math.round(box!.railRight)} and the content starts at ${Math.round(box!.columnLeft)}`,
      ).toBeLessThan(box!.columnLeft);
    }

    // AND IT IS NOT THERE ON A PHONE, where there is no gutter to be in and the
    // page is four headings long.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await expect(page.locator('.section-rail')).toBeHidden();

    await ctx.close();
  });

  test('is four real links, in order, that scroll to their own sections', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

    const rail = page.getByRole('navigation', { name: 'Sections on this page' });
    const links = rail.getByRole('link');
    await expect(links).toHaveCount(SECTIONS.length);

    for (const [i, section] of SECTIONS.entries()) {
      const link = links.nth(i);
      // A REAL ANCHOR TO A REAL ID. This is what makes the rail work with no
      // JavaScript at all; the click handler only upgrades it to a smooth
      // scroll. An href of "#" with an onClick would pass every other check in
      // this file and be broken before hydration.
      await expect(link).toHaveAttribute('href', `#${section.id}`);
      await expect(link).toHaveText(section.label);
      await expect(page.locator(`section#${section.id}`)).toHaveCount(1);
    }

    // Clicking the third dot puts the third section at the top of the window,
    // and leaves the URL at the anchor so the position is shareable.
    //
    // WAITED FOR RATHER THAN SLEPT THROUGH. The Overview with 37 out-of-range
    // markers on it is about 15,000px tall, and Chromium's smooth scroll over
    // that distance settles in roughly 1.5s — a fixed 900ms wait passed on a
    // short page and failed on the real one, which is the page this is meant to
    // be measuring.
    await links.nth(2).click();
    await page.waitForFunction(
      () => Math.abs(document.getElementById('go-deeper')!.getBoundingClientRect().top) < 140,
      null,
      { timeout: 15_000 },
    );
    expect(page.url()).toContain('#go-deeper');
    expect(await activeLabel(page)).toBe('Go deeper');

    await ctx.close();
  });

  test('fills the dot for the section being read, and only that one', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.waitForTimeout(400);

    // At the top of the page, the first section.
    expect(await activeLabel(page)).toBe('Worth a conversation');
    await expect(page.locator('.section-rail__link.is-active')).toHaveCount(1);
    await expect(page.locator('.section-rail__link.is-active')).toHaveAttribute('aria-current', 'true');

    // Scrolled so a later section has passed the line, that one — and reading
    // it off the scroll position rather than off a click, because the two are
    // different code paths and only one of them is what a reader does.
    await page.locator('#whats-changed').evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'instant' as ScrollBehavior });
    });
    await page.waitForTimeout(400);
    expect(await activeLabel(page)).toBe('What’s changed');
    await expect(page.locator('.section-rail__link.is-active')).toHaveCount(1);

    // AT THE VERY BOTTOM IT IS THE LAST SECTION, whatever the line says. A
    // short final section under a long one never reaches 30% of the viewport,
    // so without this the rail marks the second-to-last for ever while the
    // reader looks at the last.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    expect(await activeLabel(page)).toBe(SECTIONS[SECTIONS.length - 1].label);

    await ctx.close();
  });
});
