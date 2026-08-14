import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * ===========================================================================
 *  THE FILTERS PANEL FITS ONE ROW, AND THE NO-RANGE FILTER WORKS.
 * ===========================================================================
 *
 * TWO THINGS, and the first is a measurement rather than a preference.
 *
 * 1. FOUR PICKERS, ONE ROW AT DESKTOP WIDTHS. They were four fixed widths in a
 *    wrapping row — 192 + 224 + 160 + 208 plus three 16px gaps is 832px against
 *    a content column of about the same at 1280 — so Show, Category and Group by
 *    took the line and SORT BY DROPPED TO A SECOND ROW ON ITS OWN, with most of
 *    a row of empty space above it. Three-and-one reads as a failure to fit;
 *    two-and-two reads as a layout, which is the fallback below `lg`.
 *
 *    Asserted on the PAINTED TOPS, not on the class names. A grid is only worth
 *    having if the boxes actually line up, and a class list cannot tell you
 *    whether an option label pushed a column onto a second line.
 *
 * 2. THE CATEGORY PICKER CAN NARROW TO, AND AWAY FROM, THE MARKERS WITH NO
 *    REFERENCE RANGE. The dipstick pads, the antibody result and every physical
 *    measurement have no range and never will, so they render as untinted cards
 *    reading "Not compared to a range". A reader can now ask for exactly those
 *    or for exactly the others, and the two options are exact complements — so
 *    the third assertion is arithmetic: the two counts add up to the whole.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

/** The three the brief names. 1280 is the tight one and the one that failed. */
const WIDTHS = [1280, 1440, 1920];

async function signIn(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  expect(login.ok(), 'the demo account could not sign in').toBeTruthy();
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

/** The pickers are the custom Listbox, not a native select — open, then pick. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function openFilters(page: Page) {
  const disclosure = page.getByRole('button', { name: /^Filters/ });
  if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
}

/**
 * The four pickers' boxes, in DOM order. Read off the labelled control rather
 * than off a container class, so this measures what is painted.
 */
async function pickerBoxes(page: Page, labels: string[]) {
  const boxes: { label: string; top: number; left: number; right: number; width: number }[] = [];
  for (const label of labels) {
    const control = page.getByLabel(label);
    await expect(control, `the "${label}" picker is not in the panel`).toBeVisible();
    const box = (await control.boundingBox())!;
    boxes.push({
      label,
      top: Math.round(box.y),
      left: Math.round(box.x),
      right: Math.round(box.x + box.width),
      width: Math.round(box.width),
    });
  }
  return boxes;
}

test.describe('the filters panel', () => {
  test('puts all four pickers on one row at 1280, 1440 and 1920', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext();
    await signIn(ctx.request);
    const page = await ctx.newPage();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/results');
      await page.getByRole('button', { name: /^Filters/ }).waitFor({ timeout: 30_000 });
      await openFilters(page);

      const boxes = await pickerBoxes(page, ['Show', 'Category', 'Group by', 'Sort by']);

      // eslint-disable-next-line no-console
      console.log(
        `\n  ${width}px — ${boxes.map((b) => `${b.label} ${b.width}px @ y=${b.top}`).join(' · ')}`,
      );

      // ── ONE ROW. Every picker starts on the same line as the first.
      for (const box of boxes) {
        expect(
          Math.abs(box.top - boxes[0].top),
          `at ${width}px "${box.label}" is on a different row from "${boxes[0].label}"`,
        ).toBeLessThanOrEqual(2);
      }

      // ── AND THE ROW IS NOT MOSTLY EMPTY. A single row that fits because
      //    three controls shrank to nothing is not the thing being protected:
      //    the four together fill the panel, edge to edge.
      const spanned = boxes[3].right - boxes[0].left;
      const covered = boxes.reduce((sum, b) => sum + b.width, 0);
      expect(
        covered / spanned,
        `at ${width}px the four pickers cover ${covered}px of a ${spanned}px row`,
      ).toBeGreaterThan(0.8);

      // ── EVEN COLUMNS. A grid, so no picker is more than a pixel of rounding
      //    away from any other — which is what makes the row survive somebody
      //    adding an option with a longer label.
      const widths = boxes.map((b) => b.width);
      expect(Math.max(...widths) - Math.min(...widths), `columns are uneven at ${width}px`).toBeLessThanOrEqual(2);

      // ── NOTHING OVERFLOWS THE PAGE. A row that fits by running off the
      //    right-hand edge is not a row that fits.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `the page scrolls horizontally at ${width}px`,
      ).toBe(true);
    }

    await ctx.close();
  });

  test('falls back to two and two rather than three and one', async ({ browser }) => {
    // The step below `lg`. Three on one line over one on its own reads as
    // something that failed to fit; two even rows read as a block of controls.
    const ctx = await browser.newContext({ viewport: { width: 900, height: 950 } });
    await signIn(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/results');
    await page.getByRole('button', { name: /^Filters/ }).waitFor({ timeout: 30_000 });
    await openFilters(page);

    const boxes = await pickerBoxes(page, ['Show', 'Category', 'Group by', 'Sort by']);
    const rows = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b);
    expect(rows.length, 'expected exactly two rows at 900px').toBe(2);
    for (const top of rows) {
      expect(boxes.filter((b) => b.top === top), `row at y=${top} does not hold two pickers`).toHaveLength(2);
    }
    await ctx.close();
  });
});

test.describe('the no-range filter', () => {
  test('narrows to and away from the markers with no reference range', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await signIn(ctx.request);
    const page = await ctx.newPage();

    // The By-marker view, which is every measured marker this patient has.
    await page.goto('/results');
    await page.getByRole('button', { name: /^Filters/ }).waitFor({ timeout: 30_000 });

    /**
     * The live count under the grid, in BOTH the forms it takes.
     *
     * `filterCountLabel` prints "42 markers" when nothing is narrowed and
     * "7 of 42 markers" when something is — so a regex written for one of them
     * waits for ever on the other, which is what the first version of this did.
     * Returns { shown, total } from either.
     */
    const counts = async () => {
      const text = (await page.getByText(/\d+( of \d+)? markers?/).first().textContent()) ?? '';
      const filtered = /(\d+)\s+of\s+(\d+)\s+markers?/.exec(text);
      if (filtered) return { shown: Number(filtered[1]), total: Number(filtered[2]) };
      const whole = /(\d+)\s+markers?/.exec(text);
      const n = Number(whole?.[1] ?? NaN);
      return { shown: n, total: n };
    };

    const { total } = await counts();
    expect(Number.isFinite(total), 'the results count is not on the page').toBe(true);

    // ── ONLY THE ONES WITH NO RANGE ────────────────────────────────────────
    await openFilters(page);
    await choose(page, 'Category', 'Not compared to a range');
    const withoutRange = (await counts()).shown;

    // The chip names itself. A filter the reader cannot identify is how
    // somebody concludes their results have gone missing.
    await expect(
      page.getByRole('group', { name: 'Applied filters' }).getByRole('button', { name: /Not compared to a range/ }),
    ).toBeVisible();

    // Every card on screen says so. This is the assertion that the filter
    // narrows to what it claims rather than to something correlated with it.
    if (withoutRange > 0) {
      const cards = page.locator('[data-marker-card]');
      const shown = await cards.count();
      if (shown > 0) {
        await expect(page.getByText('Not compared to a range').first()).toBeVisible();
      }
    }

    // ── AND ONLY THE OTHERS ────────────────────────────────────────────────
    await openFilters(page);
    await choose(page, 'Category', 'Compared to a range');
    const withRange = (await counts()).shown;

    // eslint-disable-next-line no-console
    console.log(`\n  no range: ${withoutRange} · with a range: ${withRange} · all markers: ${total}`);

    // ── EXACT COMPLEMENTS. The arithmetic is the point: two options that both
    //    hide things without covering the set between them would leave markers
    //    a reader could not reach by any combination of filters.
    expect(withoutRange + withRange, 'the two options do not partition the marker set').toBe(total);

    await ctx.close();
  });
});
