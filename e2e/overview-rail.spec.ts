import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * THE SECTION RAIL, MEASURED RATHER THAN REVIEWED.
 *
 * A vertical index of the Overview's own sections, on the RIGHT of the content
 * column: a readable list of horizontal labels at rest, and a line with one
 * node per section once the reader has scrolled. Almost everything about it is
 * a geometric claim, and the two that matter most are claims about things NOT
 * touching:
 *
 *   · it must not collide with the content at any width
 *   · it must not run off the side of the window
 *
 * Neither is something a screenshot settles. Two boxes overlapping by four
 * pixels looks like a design decision in a picture and like a bug on a laptop,
 * which is the same reason previous-results-layout.spec.ts exists. So the boxes
 * are read off the page at three widths, including the narrowest one that shows
 * the rail at all — 1280px with the sidebar expanded, where the free space to
 * the right of the column is `main`'s own padding and nothing else, which is
 * why the sections wrapper reserves the rest of the rail's width itself.
 *
 * The rest is behaviour that has to survive: the nodes are real links (so the
 * rail works before hydration and with JavaScript off), the filled one tracks
 * the section being read, the labels are readable at the top of the page and
 * gone once it is scrolled, and the whole thing is absent on a phone.
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

/** Which node is filled, by its label. */
async function activeLabel(page: Page): Promise<string | null> {
  const active = page.locator('.section-rail__link.is-active');
  if ((await active.count()) === 0) return null;
  return (await active.first().innerText()).trim();
}

test.describe('the Overview section rail', () => {
  test('sits to the right of the content without touching it, at every width and in both states', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

    // 1280 is the breakpoint itself and therefore the worst case: `main` has
    // 80px of padding, the content column fills everything inside it, and the
    // rest of the rail's width has to be reserved by the sections wrapper.
    // 1440 is the common laptop. 1920 is where the column starts centring and
    // the gutter grows.
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);

      // Measured in BOTH states, because the expanded one is 168px of labels
      // and the collapsed one is a line with nodes on it — the reservation is
      // meant to be the same either way, so the page does not reflow under the
      // reader on their first scroll.
      for (const scrollTo of [0, 1200]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), scrollTo);
        await page.waitForTimeout(300);

        const box = await page.evaluate(() => {
          const rail = document.querySelector('.section-rail')?.getBoundingClientRect();
          const aside = document.querySelector('aside')?.getBoundingClientRect();
          // The widest thing the rail could collide with: every section on the
          // page, not just the first. A section wider than its neighbours is
          // exactly where a reserved gutter would be found not to be reserved.
          const contentRight = Math.max(
            ...[...document.querySelectorAll('main section')].map((el) => el.getBoundingClientRect().right),
          );
          return rail && aside
            ? {
                railLeft: rail.left,
                railRight: rail.right,
                asideRight: aside.right,
                contentRight,
                state: document.querySelector('.section-rail')?.getAttribute('data-state'),
              }
            : null;
        });
        expect(box, `no rail at ${width}px`).not.toBeNull();
        const where = `${width}px, ${box!.state}`;

        expect(
          box!.railLeft,
          `${where}: the rail starts at ${Math.round(box!.railLeft)} and the content ends at ${Math.round(box!.contentRight)}`,
        ).toBeGreaterThanOrEqual(box!.contentRight);
        // The sidebar is on the other side entirely; this only fails if the
        // rail has been positioned against the viewport by mistake.
        expect(box!.railLeft, `${where}: the rail is inside the sidebar`).toBeGreaterThan(box!.asideRight);
        expect(
          box!.railRight,
          `${where}: the rail ends at ${Math.round(box!.railRight)} on a ${width}px window`,
        ).toBeLessThanOrEqual(width);
      }
    }

    // AND IT IS NOT THERE ON A PHONE, where there is no gutter to be in and the
    // page is four headings long.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await expect(page.locator('.section-rail')).toBeHidden();

    await ctx.close();
  });

  /**
   * THE TWO STATES, AND THE ONE THING THAT SURVIVES BOTH.
   *
   * At rest it is a list you can read. Once the reader scrolls it is a line
   * with a node per section and the labels are gone — but only from VIEW: they
   * stay in the accessibility tree, because a collapsed rail whose links have
   * no names is four anonymous shapes to a screen reader, and they come back on
   * hover or focus.
   */
  test('reads as labels at the top of the page and as nodes once it is scrolled', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.waitForTimeout(300);

    const rail = page.locator('.section-rail');
    const firstLabel = page.locator('.section-rail__label').first();

    // EXPANDED: ordinary horizontal text, laid out in flow, fully opaque.
    await expect(rail).toHaveAttribute('data-state', 'expanded');
    const expanded = await firstLabel.evaluate((el) => {
      const style = getComputedStyle(el);
      return { opacity: Number(style.opacity), position: style.position, width: el.getBoundingClientRect().width };
    });
    expect(expanded.opacity, 'the labels are the expanded state').toBe(1);
    expect(expanded.position, 'an expanded label is in flow, not floated over the page').toBe('static');
    expect(expanded.width, 'an expanded label has real width').toBeGreaterThan(40);

    // COLLAPSED: out of flow, invisible, and still named.
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(400);
    await expect(rail).toHaveAttribute('data-state', 'collapsed');
    const collapsed = await firstLabel.evaluate((el) => ({
      opacity: Number(getComputedStyle(el).opacity),
      position: getComputedStyle(el).position,
    }));
    expect(collapsed.opacity, 'the labels are gone once the page is scrolled').toBe(0);
    expect(collapsed.position, 'a collapsed label is taken out of flow rather than shrunk').toBe('absolute');
    // The accessible name is unchanged, which is the whole reason it is hidden
    // by opacity rather than by `display: none`.
    await expect(page.getByRole('link', { name: SECTIONS[0].label })).toHaveCount(1);

    // HOVER BRINGS IT BACK, to the LEFT of the node and over the content.
    const link = page.locator('.section-rail__link').first();
    await link.hover();
    await page.waitForTimeout(300);
    const revealed = await firstLabel.evaluate((el) => {
      const label = el.getBoundingClientRect();
      const node = (el.parentElement!.querySelector('.section-rail__node') as HTMLElement).getBoundingClientRect();
      return { opacity: Number(getComputedStyle(el).opacity), labelRight: label.right, nodeLeft: node.left };
    });
    expect(revealed.opacity, 'hovering a node reveals its label').toBe(1);
    expect(revealed.labelRight, 'the revealed label sits to the left of its node').toBeLessThanOrEqual(
      revealed.nodeLeft,
    );

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
      expect((await link.innerText()).trim(), `link ${i}`).toBe(section.label);
      await expect(page.locator(`section#${section.id}`)).toHaveCount(1);
    }

    // Clicking the third node puts the third section at the top of the window,
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

  test('fills the node for the section being read, and only that one', async ({ browser }) => {
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
